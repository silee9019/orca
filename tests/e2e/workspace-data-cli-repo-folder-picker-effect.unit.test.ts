import { registerRepoFolderPickerHandlers } from '../../src/main/ipc/repos/repo-folder-picker-handlers'
import { setRepoFolderSelectionPicker } from '../../src/main/repo-picker-service'
import {
  WORKSPACE_REPO_ICON_PICKER_METHODS,
  setDesktopRepoIconPickerForRpc
} from '../../src/main/runtime/rpc/methods/workspace-repo-icon-picker'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import type { OpenDialogReturnValue } from 'electron'
import type { HandlerContext } from '../../src/cli/dispatch'
const fixture = vi.hoisted(() => ({ dialog: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: class {
    isDestroyed() {
      return false
    }
    webContents = { send: vi.fn() }
  },
  dialog: { showOpenDialog: fixture.dialog }
}))
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
import { WORKSPACE_REPO_FOLDER_PICKER_HANDLERS } from '../../src/cli/handlers/workspace-repo-folder-picker'
import {
  WORKSPACE_REPO_FOLDER_PICKER_METHODS,
  setDesktopRepoFolderPickerForRpc
} from '../../src/main/runtime/rpc/methods/workspace-repo-folder-picker'
import { registerRepoIconPickerHandlers } from '../../src/main/repo-icon-picker-handlers'
import type { RepoPickerRequests } from '../../src/main/repo-picker-requests'
let picker: RepoPickerRequests
let resolveDialog: ((value: OpenDialogReturnValue) => void) | null = null
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let runtime: OrcaRuntimeService
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-repo-icon-picker-cli-'))
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
  fixture.dialog.mockReset()
  fixture.dialog.mockImplementation(
    () =>
      new Promise<OpenDialogReturnValue>((resolve) => {
        resolveDialog = resolve
      })
  )
  runtime = new OrcaRuntimeService(store)
  picker = registerRepoIconPickerHandlers()
  registerRepoFolderPickerHandlers(new BrowserWindow())
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: [...WORKSPACE_REPO_FOLDER_PICKER_METHODS, ...WORKSPACE_REPO_ICON_PICKER_METHODS]
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
  if (resolveDialog) {
    resolveDialog({ canceled: true, filePaths: [] })
    resolveDialog = null
  }
  picker.dispose()
  setDesktopRepoIconPickerForRpc(null)
  setDesktopRepoFolderPickerForRpc(null)
  setRepoFolderSelectionPicker(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

async function invoke(command: string, params: object, confirm = false, output?: string) {
  const file = join(directory, 'input.json')
  await writeFile(file, JSON.stringify(params))
  ctx.flags.set('params-file', file)
  ctx.flags.delete('confirm')
  ctx.flags.delete('output')
  if (confirm) {
    ctx.flags.set('confirm', 'repo-folder-picker')
  }
  if (output) {
    ctx.flags.set('output', output)
  }
  await WORKSPACE_REPO_FOLDER_PICKER_HANDLERS[command](ctx)
  return lastResult()
}
function select(paths: string[] | null) {
  if (!resolveDialog) {
    throw new Error('Missing fixture dialog')
  }
  resolveDialog({ canceled: paths === null, filePaths: paths ?? [] })
  resolveDialog = null
}
const request = (requestId: string) => ({ requestId, expectedExecutionHostId: 'local' })
it('reuses each original native folder mode and returns host paths without adding repos or changing files', async () => {
  const first = join(directory, 'one'),
    second = join(directory, 'two')
  await mkdir(first)
  await mkdir(second)
  await writeFile(join(first, 'keep.txt'), 'keep')
  for (const kind of ['folder', 'folders', 'directory']) {
    const started = await invoke(
      'repo folder-picker-start',
      { kind, expectedExecutionHostId: 'local' },
      true
    )
    await vi.waitFor(() => expect(resolveDialog).not.toBeNull())
    expect(fixture.dialog).toHaveBeenLastCalledWith(expect.any(BrowserWindow), {
      properties: kind === 'folders' ? ['openDirectory', 'multiSelections'] : ['openDirectory']
    })
    select([first, second])
    await vi.waitFor(() =>
      expect(picker.status(started.requestId, 'folders').state).toBe('completed')
    )
    const status = await invoke('repo folder-picker-status', request(started.requestId))
    expect(status).not.toHaveProperty('paths')
    const result = await invoke('repo folder-picker-result', request(started.requestId))
    expect(result).toEqual({ kind, paths: kind === 'folders' ? [first, second] : [first] })
  }
  expect(store.getRepos()).toEqual([])
  expect(await readFile(join(first, 'keep.txt'), 'utf8')).toBe('keep')
})
it('keeps cancellation pending until native completion and separates icon and folder request scopes', async () => {
  const started = await invoke(
    'repo folder-picker-start',
    { kind: 'folders', expectedExecutionHostId: 'local' },
    true
  )
  await vi.waitFor(() => expect(resolveDialog).not.toBeNull())
  await expect(
    ctx.client.call('repoIconPicker.start', { expectedExecutionHostId: 'local' })
  ).rejects.toThrow(/already pending/)
  await expect(
    ctx.client.call('repoIconPicker.cancel', request(started.requestId))
  ).rejects.toMatchObject({ code: 'selector_not_found' })
  expect((await invoke('repo folder-picker-cancel', request(started.requestId))).state).toBe(
    'cancel_requested'
  )
  select([directory])
  await vi.waitFor(() =>
    expect(picker.status(started.requestId, 'folders').state).toBe('cancelled')
  )
  await expect(invoke('repo folder-picker-result', request(started.requestId))).rejects.toThrow(
    /completed/
  )
})
it('rejects missing confirmation, desktop service absence and old peers before a client picker fallback', async () => {
  const params = { kind: 'folder', expectedExecutionHostId: 'local' }
  await expect(invoke('repo folder-picker-start', params)).rejects.toThrow()
  setDesktopRepoFolderPickerForRpc(null)
  await expect(invoke('repo folder-picker-start', params, true)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('repo folder-picker-start', params, true)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(fixture.dialog).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
