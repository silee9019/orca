import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile, readFile, stat, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OpenDialogReturnValue } from 'electron'
import type { HandlerContext } from '../../src/cli/dispatch'
const fixture = vi.hoisted(() => ({ dialog: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
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
import { MAX_REPO_ICON_UPLOAD_BYTES } from '../../src/shared/repo-icon'
import { WORKSPACE_REPO_ICON_PICKER_HANDLERS } from '../../src/cli/handlers/workspace-repo-icon-picker'
import {
  WORKSPACE_REPO_ICON_PICKER_METHODS,
  setDesktopRepoIconPickerForRpc
} from '../../src/main/runtime/rpc/methods/workspace-repo-icon-picker'
import { registerRepoIconPickerHandlers } from '../../src/main/repo-icon-picker-handlers'
import type { RepoIconPickerRequests } from '../../src/main/repo-icon-picker-requests'
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='
let imageFile: string
let picker: RepoIconPickerRequests
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
  imageFile = join(directory, 'server-source.png')
  await writeFile(imageFile, Buffer.from(png, 'base64'))
  runtime = new OrcaRuntimeService(store)
  picker = registerRepoIconPickerHandlers()
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_REPO_ICON_PICKER_METHODS
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
    ctx.flags.set('confirm', 'repo-icon-picker')
  }
  if (output) {
    ctx.flags.set('output', output)
  }
  await WORKSPACE_REPO_ICON_PICKER_HANDLERS[command](ctx)
  return lastResult()
}
function select(file: string | null) {
  if (!resolveDialog) {
    throw new Error('Missing fixture picker')
  }
  resolveDialog({ canceled: file === null, filePaths: file ? [file] : [] })
  resolveDialog = null
}
async function start() {
  return invoke('repo icon-picker-start', { expectedExecutionHostId: 'local' }, true)
}
function request(requestId: string) {
  return { requestId, expectedExecutionHostId: 'local' }
}
it('starts without waiting for a person, reports metadata, and exports actual PNG bytes privately', async () => {
  const started = await start()
  expect(started.state).toBe('pending')
  expect(fixture.dialog).toHaveBeenCalledWith({
    properties: ['openFile'],
    filters: [{ name: 'Repo icon images', extensions: ['png'] }]
  })
  expect((await invoke('repo icon-picker-status', request(started.requestId))).humanAction).toBe(
    'select-or-cancel-on-desktop'
  )
  select(imageFile)
  await vi.waitFor(() => expect(picker.status(started.requestId).state).toBe('completed'))
  const output = join(directory, 'client-output.png')
  await invoke('repo icon-picker-result', request(started.requestId), false, output)
  expect(await readFile(output)).toEqual(await readFile(imageFile))
  if (process.platform !== 'win32') {
    expect((await stat(output)).mode & 0o777).toBe(0o600)
  }
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('data:image/png')
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(imageFile)
})
it('keeps cancellation pending until the native selection settles and discards later image acceptance', async () => {
  const started = await start()
  const params = request(started.requestId)
  expect((await invoke('repo icon-picker-cancel', params)).state).toBe('cancel_requested')
  await expect(start()).rejects.toThrow(/already pending/)
  expect(picker.status(started.requestId).humanAction).toBe('close-native-picker')
  select(imageFile)
  await vi.waitFor(() => expect(picker.status(started.requestId).state).toBe('cancelled'))
  const output = join(directory, 'cancelled.png')
  await expect(invoke('repo icon-picker-result', params, false, output)).rejects.toThrow(
    /completed image/
  )
  await expect(access(output)).rejects.toThrow()
  expect(fixture.dialog).toHaveBeenCalledOnce()
})
it('preserves extension and size failures without exposing selected bytes or filenames', async () => {
  for (const [name, bytes] of [
    ['private-canary.txt', Buffer.from(png, 'base64')],
    ['private-canary.png', Buffer.alloc(MAX_REPO_ICON_UPLOAD_BYTES + 1)]
  ]) {
    const file = join(directory, String(name))
    await writeFile(file, bytes)
    const started = await start()
    select(file)
    await vi.waitFor(() => expect(picker.status(started.requestId).state).toBe('failed'))
    await invoke('repo icon-picker-status', request(started.requestId))
  }
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-canary')
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('data:image/png')
})
it('does not overwrite an output file and rejects unsupported image data URIs before writing', async () => {
  const first = await start()
  select(imageFile)
  await vi.waitFor(() => expect(picker.status(first.requestId).state).toBe('completed'))
  const output = join(directory, 'existing.png')
  await writeFile(output, 'existing')
  await expect(
    invoke('repo icon-picker-result', request(first.requestId), false, output)
  ).rejects.toThrow(/without overwriting/)
  expect(await readFile(output, 'utf8')).toBe('existing')
  const response = await ctx.client.call('repoIconPicker.result', request(first.requestId))
  vi.mocked(ctx.client.call).mockResolvedValueOnce({
    ...response,
    result: { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', fileName: 'invalid.png' }
  })
  const rejected = join(directory, 'rejected.png')
  await expect(
    invoke('repo icon-picker-result', request(first.requestId), false, rejected)
  ).rejects.toThrow(/invalid PNG/)
  await expect(access(rejected)).rejects.toThrow()
})
it('rejects missing confirmation, missing desktop service and old peers without opening a client picker', async () => {
  const params = { expectedExecutionHostId: 'local' }
  await expect(invoke('repo icon-picker-start', params)).rejects.toThrow()
  setDesktopRepoIconPickerForRpc(null)
  await expect(invoke('repo icon-picker-start', params, true)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('repo icon-picker-start', params, true)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(fixture.dialog).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
