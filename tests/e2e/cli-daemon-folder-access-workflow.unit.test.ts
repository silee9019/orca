import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { DAEMON_FOLDER_ACCESS_METHODS } from '../../src/main/runtime/rpc/methods/daemon-folder-access'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { DaemonFolderAccessStatusParams } from '../../src/shared/rpc-contract/daemon-folder-access-params'
import { PROTOCOL_VERSION } from '../../src/main/daemon/types'

const state = vi.hoisted(() => ({
  identity: { pid: 987654321, startedAtMs: 123, launchNonce: 'private-daemon-nonce' },
  path: '/private-folder-fixture',
  access: 'unknown',
  busy: false,
  absent: false,
  call: vi.fn(),
  reset: vi.fn(),
  probe: vi.fn(),
  adapter: { marker: 'isolated-fake-provider' }
}))
vi.mock('../../src/main/daemon/daemon-init', () => ({
  getDaemonProvider: () => (state.absent ? null : state.adapter)
}))
vi.mock('../../src/main/daemon/daemon-provider-routing', () => ({
  getCurrentDaemonAdapter: () => ({
    protocolVersion: PROTOCOL_VERSION,
    getDaemonIdentity: () => state.identity
  })
}))
vi.mock('../../src/main/daemon/daemon-provider-restart', () => ({ restartDaemon: vi.fn() }))
vi.mock('../../src/main/daemon/daemon-restart-state', () => ({
  isDaemonRestartInFlight: () => state.busy
}))
vi.mock('../../src/main/daemon/daemon-folder-access-reset', () => ({
  resetFolderAccessForDaemon: state.reset
}))
vi.mock('../../src/main/daemon/daemon-folder-access-mismatch', () => ({
  getDaemonFolderAccessTarget: () => ({ canonicalPath: state.path, cwdClass: 'documents' }),
  getDaemonFolderAccessMismatch: () => ({
    daemonScope: 'fixture',
    cwdClass: 'documents',
    freshDaemonAccess: state.access
  }),
  refreshDaemonFolderAccessProbe: state.probe
}))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = state.call
  }
}))
const platform = process.platform
let root: string
let runtime: OrcaRuntimeService
let settle: (() => void) | undefined
beforeEach(async () => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
  root = await mkdtemp(join(tmpdir(), 'orca-folder-workflow-'))
  state.identity = { pid: 987654321, startedAtMs: 123, launchNonce: 'private-daemon-nonce' }
  state.path = '/private-folder-fixture'
  state.access = 'unknown'
  state.busy = false
  state.absent = false
  settle = undefined
  state.reset.mockReset().mockImplementation(async (_identity, options) => {
    options.assertOwner()
    return { outcome: 'probed', mismatch: null }
  })
  state.probe.mockReset().mockResolvedValue(undefined)
  runtime = new OrcaRuntimeService()
  const dispatcher = new RpcDispatcher({ runtime, methods: DAEMON_FOLDER_ACCESS_METHODS })
  state.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const r = await dispatcher.dispatch({ id: 'fixture', method, params })
    if (!r.ok) {
      throw new RuntimeRpcFailureError(r)
    }
    return r
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  settle?.()
  await Promise.resolve()
  await Promise.resolve()
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function plan() {
  return (await state.call('daemon.folderAccessPlan', {})).result
}
async function command(action: string, request?: unknown) {
  const file = join(root, 'request.json')
  if (request) {
    await writeFile(file, JSON.stringify(request))
  }
  process.exitCode = undefined
  await main(
    [
      'terminal',
      'daemon',
      `folder-access-${action}`,
      ...(request ? ['--request-file', file] : []),
      '--json'
    ],
    root
  )
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}
async function pin() {
  const target = DaemonFolderAccessStatusParams.omit({ operationId: true })
    .strip()
    .parse(await plan())
  return { ...target, operationId: randomUUID() }
}
it('starts once, exposes status, and verifies only an explicit human answer with a fresh probe', async () => {
  const observed = await command('plan')
  expect(observed.result.targetDigest).toHaveLength(64)
  const target = await pin(),
    start = { ...target, confirm: true, allowOsPrompt: true }
  await command('start', start)
  await command('start', start)
  expect(state.reset).toHaveBeenCalledOnce()
  const status = await command('status', target)
  expect(status.result.permissionConfirmed).toBe(false)
  expect(state.probe).not.toHaveBeenCalled()
  const unknown = await command('complete', { ...target, confirm: true, humanResponded: true })
  expect(process.exitCode).toBe(1)
  expect(unknown.error.code).toBe('folder_access_unconfirmed')
  state.access = 'denied'
  await command('complete', { ...target, confirm: true, humanResponded: true })
  expect(process.exitCode).toBe(1)
  state.access = 'allowed'
  const result = await command('complete', { ...target, confirm: true, humanResponded: true })
  expect(process.exitCode).toBeUndefined()
  expect(result.result.permissionConfirmed).toBe(true)
  expect(state.probe).toHaveBeenCalledTimes(3)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toMatch(
    /private-daemon-nonce|private-folder-fixture/
  )
})
it.each([
  'stale-daemon',
  'stale-folder',
  'wrong-runtime',
  'invalid-confirm',
  'invalid-prompt',
  'busy',
  'absent',
  'other-os'
])('refuses unsafe permission workflow before resetting: %s', async (mode) => {
  const target = await pin(),
    request = { ...target, confirm: true, allowOsPrompt: true }
  if (mode === 'stale-daemon') {
    state.identity = { ...state.identity, startedAtMs: 124 }
  }
  if (mode === 'stale-folder') {
    state.path = '/different-private-folder'
  }
  if (mode === 'wrong-runtime') {
    request.runtimeId = 'other'
  }
  if (mode === 'invalid-confirm') {
    request.confirm = false
  }
  if (mode === 'invalid-prompt') {
    request.allowOsPrompt = false
  }
  if (mode === 'busy') {
    state.busy = true
  }
  if (mode === 'absent') {
    state.absent = true
  }
  if (mode === 'other-os') {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
  }
  await command('start', request)
  expect(process.exitCode).toBe(1)
  expect(state.reset).not.toHaveBeenCalled()
})
it('cancels the workflow without claiming to cancel the OS operation or granting access', async () => {
  const target = await pin()
  state.reset.mockImplementation(async (_identity, options) => {
    await new Promise<void>((resolve) => {
      settle = resolve
    })
    options.assertOwner()
    return { outcome: 'probed', mismatch: null }
  })
  await command('start', { ...target, confirm: true, allowOsPrompt: true })
  await command('complete', { ...target, confirm: true, humanResponded: true })
  expect(process.exitCode).toBe(1)
  expect(state.probe).not.toHaveBeenCalled()
  const cancelled = await command('cancel', { ...target, confirm: true })
  expect(cancelled.result).toMatchObject({
    state: 'cancelled',
    resetWorkInFlight: true,
    permissionConfirmed: false,
    osPromptMayRemain: true,
    cancellationUndoesPermissionReset: false
  })
  settle?.()
  await vi.waitFor(async () =>
    expect((await state.call('daemon.folderAccessStatus', target)).result.resetWorkInFlight).toBe(
      false
    )
  )
  await command('start', { ...target, confirm: true, allowOsPrompt: true })
  expect(state.reset).toHaveBeenCalledOnce()
  await command('complete', { ...target, confirm: true, humanResponded: true })
  expect(process.exitCode).toBe(1)
  expect(state.probe).not.toHaveBeenCalled()
})
it('refuses a changed daemon after a pending reset without probing the replacement', async () => {
  const target = await pin()
  state.reset.mockImplementation(async (_identity, options) => {
    await new Promise<void>((resolve) => {
      settle = resolve
    })
    options.assertOwner()
    return { outcome: 'probed', mismatch: null }
  })
  await command('start', { ...target, confirm: true, allowOsPrompt: true })
  state.identity = { ...state.identity, startedAtMs: 124 }
  settle?.()
  await Promise.resolve()
  await Promise.resolve()
  await command('complete', { ...target, confirm: true, humanResponded: true })
  expect(process.exitCode).toBe(1)
  expect(state.probe).not.toHaveBeenCalled()
  const cancelled = await command('cancel', { ...target, confirm: true })
  expect(cancelled.result.permissionConfirmed).toBe(false)
})
it('rejects missing human confirmation, other operation IDs and concurrent starts', async () => {
  const target = await pin()
  await command('start', { ...target, confirm: true, allowOsPrompt: true })
  await command('complete', { ...target, confirm: true, humanResponded: false })
  expect(process.exitCode).toBe(1)
  expect(state.probe).not.toHaveBeenCalled()
  await command('status', { ...target, operationId: randomUUID() })
  expect(process.exitCode).toBe(1)
  await command('start', {
    ...target,
    operationId: randomUUID(),
    confirm: true,
    allowOsPrompt: true
  })
  expect(process.exitCode).toBe(1)
  expect(state.reset).toHaveBeenCalledOnce()
})
it('rejects private fields and unconfirmed completion receipts from a hostile host', async () => {
  const target = await pin()
  state.call.mockResolvedValue({
    ok: true,
    _meta: { runtimeId: target.runtimeId },
    result: {
      ...target,
      state: 'verified',
      resetWorkInFlight: false,
      freshDaemonAccess: 'unknown',
      permissionConfirmed: true,
      osPromptMayRemain: true,
      cancellationUndoesPermissionReset: false,
      authToken: 'private-unrequested-fixture'
    }
  })
  const result = await command('complete', { ...target, confirm: true, humanResponded: true })
  expect(process.exitCode).toBe(1)
  expect(result.error.code).toBe('invalid_runtime_response')
  expect(JSON.stringify(result)).not.toContain('private-unrequested-fixture')
})

it('refuses expired receipts without replaying their reset', async () => {
  const target = await pin()
  await command('start', { ...target, confirm: true, allowOsPrompt: true })
  const later = Date.now() + 31 * 60_000
  vi.spyOn(Date, 'now').mockReturnValue(later)
  await command('status', target)
  expect(process.exitCode).toBe(1)
  await command('start', { ...target, confirm: true, allowOsPrompt: true })
  expect(process.exitCode).toBe(1)
  expect(state.reset).toHaveBeenCalledOnce()
})
it('does not grant permission when cancelled during a fresh probe', async () => {
  const target = await pin()
  await command('start', { ...target, confirm: true, allowOsPrompt: true })
  let finish: (() => void) | undefined
  state.access = 'allowed'
  state.probe.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const pending = state.call('daemon.folderAccessVerify', {
    ...target,
    confirm: true,
    humanResponded: true
  })
  await vi.waitFor(() => expect(state.probe).toHaveBeenCalledOnce())
  await state.call('daemon.folderAccessCancel', { ...target, confirm: true })
  if (!finish) {
    throw new Error('Fixture probe missing')
  }
  finish()
  expect((await pending).result).toMatchObject({
    state: 'cancelled',
    permissionConfirmed: false,
    freshDaemonAccess: 'unknown'
  })
})
