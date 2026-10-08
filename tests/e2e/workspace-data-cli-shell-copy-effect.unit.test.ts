import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile, readFile, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, shell: {}, dialog: {} }))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_SHELL_ACTION_HANDLERS } from '../../src/cli/handlers/workspace-shell-actions'
import {
  WORKSPACE_SHELL_ACTION_METHODS,
  setDesktopShellActionsForRpc
} from '../../src/main/runtime/rpc/methods/workspace-shell-actions'
import { registerShellHandlers } from '../../src/main/ipc/shell'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let runtime: OrcaRuntimeService
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-shell-copy-cli-'))
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => directory,
    getAppPath: () => directory,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  authority = new ProfileStateSqliteAuthority(join(directory, 'profile.db'), 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(directory, 'data.json'), profileStateAuthority: authority })
  runtime = new OrcaRuntimeService(store)
  registerShellHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_SHELL_ACTION_METHODS
  })
  const client = new RuntimeClient('different-client-profile')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  setDesktopShellActionsForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

async function prepare() {
  const folder = join(directory, 'document')
  await mkdir(folder)
  const documentPath = join(folder, 'notes.md')
  await writeFile(documentPath, '# unchanged')
  const srcPath = join(directory, 'source.bin')
  await writeFile(srcPath, Buffer.from([0, 1, 2, 255]))
  return {
    srcPath,
    destPath: join(folder, 'copied.bin'),
    documentPath,
    expectedExecutionHostId: 'local'
  }
}
async function invoke(
  params: {
    srcPath: string
    destPath: string
    documentPath: string
    expectedExecutionHostId: string
  },
  confirm = true
) {
  const file = join(directory, 'input.json')
  await writeFile(file, JSON.stringify(params))
  ctx.flags.set('params-file', file)
  if (confirm) {
    ctx.flags.set('confirm', params.destPath)
  } else {
    ctx.flags.delete('confirm')
  }
  await WORKSPACE_SHELL_ACTION_HANDLERS['shell copy-document-file'](ctx)
}
it('copies real bytes into an explicitly named document folder using the original no-clobber operation', async () => {
  const params = await prepare()
  await invoke(params)
  expect(lastResult()).toEqual({ copied: true })
  expect(await readFile(params.destPath)).toEqual(await readFile(params.srcPath))
  expect(await readFile(params.documentPath, 'utf8')).toBe('# unchanged')
})
it('does not overwrite an existing destination or modify the source on failure', async () => {
  const params = await prepare()
  await writeFile(params.destPath, 'existing')
  await expect(invoke(params)).rejects.toThrow('Desktop document file copy failed.')
  expect(await readFile(params.destPath, 'utf8')).toBe('existing')
  expect(await readFile(params.srcPath)).toEqual(Buffer.from([0, 1, 2, 255]))
  expect(console.log).not.toHaveBeenCalled()
})
it('rejects confirmation, host, missing document and unauthorized destination before creating files', async () => {
  const params = await prepare()
  await expect(invoke(params, false)).rejects.toThrow()
  await expect(invoke({ ...params, expectedExecutionHostId: 'ssh:fixture' })).rejects.toThrow()
  await expect(invoke({ ...params, documentPath: join(directory, 'absent.md') })).rejects.toThrow()
  await expect(invoke({ ...params, destPath: join(directory, 'outside.bin') })).rejects.toThrow()
  await expect(readFile(params.destPath)).rejects.toThrow()
  expect(console.log).not.toHaveBeenCalled()
})
it('rejects a document descendant symlink that resolves outside its authorized folder', async () => {
  const params = await prepare()
  const outside = join(directory, 'outside')
  await mkdir(outside)
  const link = join(directory, 'document', 'link')
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(invoke({ ...params, destPath: join(link, 'copy.bin') })).rejects.toThrow()
  await expect(readFile(join(outside, 'copy.bin'))).rejects.toThrow()
  expect(console.log).not.toHaveBeenCalled()
})
it('fails on absent desktop services and old peers without a client copy', async () => {
  const params = await prepare()
  setDesktopShellActionsForRpc(null)
  await expect(invoke(params)).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke(params)).rejects.toMatchObject({ code: 'method_not_found' })
  await expect(readFile(params.destPath)).rejects.toThrow()
  expect(console.log).not.toHaveBeenCalled()
})
