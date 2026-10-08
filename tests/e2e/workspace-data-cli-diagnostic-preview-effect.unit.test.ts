import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
const fixture = vi.hoisted(() => ({
  directory: '',
  open: vi.fn(),
  upload: vi.fn(),
  dialog: vi.fn(),
  handlers: new Map<string, (_event: unknown, ...args: unknown[]) => unknown>()
}))
vi.mock('electron', () => ({
  app: { getPath: () => fixture.directory, getVersion: () => 'fixture' },
  shell: { openPath: fixture.open },
  dialog: { showMessageBox: fixture.dialog },
  ipcMain: {
    handle: (channel: string, handler: (_event: unknown, ...args: unknown[]) => unknown) =>
      fixture.handlers.set(channel, handler)
  }
}))
vi.mock('../../src/main/observability', () => ({
  collectDiagnosticBundle: () => ({
    bundleSubmissionId: 'fixture-bundle-abcdefghijkl',
    payload: '{"private":"diagnostic-payload-canary"}\n',
    bytes: 40,
    spanCount: 0
  }),
  getDiagnosticsStatus: () => ({ bundleEnabled: true }),
  uploadDiagnosticBundle: fixture.upload,
  deleteDiagnosticBundle: vi.fn()
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
import { WORKSPACE_DIAGNOSTIC_PREVIEW_HANDLERS } from '../../src/cli/handlers/workspace-diagnostic-preview'
import {
  WORKSPACE_DIAGNOSTIC_PREVIEW_METHODS,
  setDesktopDiagnosticPreviewForRpc
} from '../../src/main/runtime/rpc/methods/workspace-diagnostic-preview'
import { registerDiagnosticsHandlers } from '../../src/main/ipc/diagnostics'
const bundleId = 'fixture-bundle-abcdefghijkl'
function handler(channel: string) {
  const result = fixture.handlers.get(channel)
  if (!result) {
    throw new Error('Missing fixture handler')
  }
  return result
}
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let runtime: OrcaRuntimeService
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-diagnostic-preview-cli-'))
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
  fixture.directory = directory
  fixture.handlers.clear()
  fixture.open.mockReset()
  fixture.open.mockResolvedValue('')
  runtime = new OrcaRuntimeService(store)
  registerDiagnosticsHandlers()
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_DIAGNOSTIC_PREVIEW_METHODS
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
  setDesktopDiagnosticPreviewForRpc(null)
  handler('diagnostics:discardBundlePreview')({}, bundleId)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

async function invoke(bundleSubmissionId = bundleId, confirm = true): Promise<void> {
  const file = join(directory, 'input.json')
  await writeFile(file, JSON.stringify({ bundleSubmissionId, expectedExecutionHostId: 'local' }))
  ctx.flags.set('params-file', file)
  if (confirm) {
    ctx.flags.set('confirm', bundleSubmissionId)
  } else {
    ctx.flags.delete('confirm')
  }
  await WORKSPACE_DIAGNOSTIC_PREVIEW_HANDLERS['diagnostics open-retained-preview'](ctx)
}
it('opens the retained actual preview file without returning its payload or path', async () => {
  handler('diagnostics:collectBundle')({}, 30)
  const file = join(directory, 'orca-diagnostic-bundle-previews', `${bundleId}.ndjson`)
  const before = await readFile(file, 'utf8')
  await invoke()
  expect(lastResult()).toEqual({ opened: true })
  expect(fixture.open).toHaveBeenCalledWith(file)
  expect(await readFile(file, 'utf8')).toBe(before)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
    'diagnostic-payload-canary'
  )
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(directory)
  expect(fixture.upload).not.toHaveBeenCalled()
  expect(fixture.dialog).not.toHaveBeenCalled()
})
it('rejects missing confirmation, invalid and unretained IDs before invoking the OS', async () => {
  await expect(invoke(bundleId, false)).rejects.toThrow()
  await expect(invoke('../escape')).rejects.toThrow()
  await expect(invoke()).rejects.toThrow('Diagnostic preview open failed.')
  expect(fixture.open).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
it('keeps failed opens unacknowledged and preserves the original upload consent gate', async () => {
  handler('diagnostics:collectBundle')({}, 30)
  fixture.open.mockResolvedValue('private-open-canary')
  await expect(invoke()).rejects.toThrow('Diagnostic preview open failed.')
  await expect(handler('diagnostics:uploadBundle')({}, bundleId)).rejects.toThrow(
    'open the review file before sending'
  )
  expect(console.log).not.toHaveBeenCalled()
  expect(fixture.upload).not.toHaveBeenCalled()
  expect(fixture.dialog).not.toHaveBeenCalled()
})
it('preserves TTL pruning and deletes expired retained preview files', async () => {
  handler('diagnostics:collectBundle')({}, 30)
  const file = join(directory, 'orca-diagnostic-bundle-previews', `${bundleId}.ndjson`)
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60 * 1000)
  await expect(invoke()).rejects.toThrow('Diagnostic preview open failed.')
  await expect(access(file)).rejects.toThrow()
  expect(fixture.open).not.toHaveBeenCalled()
})
it('fails on missing services and old peers without native or network side effects', async () => {
  setDesktopDiagnosticPreviewForRpc(null)
  await expect(invoke()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke()).rejects.toMatchObject({ code: 'method_not_found' })
  expect(fixture.open).not.toHaveBeenCalled()
  expect(fixture.upload).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
