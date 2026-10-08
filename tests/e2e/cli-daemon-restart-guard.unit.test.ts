import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { DAEMON_RESTART_METHODS } from '../../src/main/runtime/rpc/methods/daemon-restart'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { PROTOCOL_VERSION } from '../../src/main/daemon/types'

const state = vi.hoisted(() => ({
  identity: { pid: 987654321, startedAtMs: 123, launchNonce: 'private-daemon-nonce' },
  busy: false,
  absent: false,
  call: vi.fn(),
  restart: vi.fn(),
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
vi.mock('../../src/main/daemon/daemon-provider-restart', () => ({ restartDaemon: state.restart }))
vi.mock('../../src/main/daemon/daemon-restart-state', () => ({
  isDaemonRestartInFlight: () => state.busy
}))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = state.call
  }
}))
let root: string
let runtime: OrcaRuntimeService
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-daemon-restart-guard-'))
  state.identity = { pid: 987654321, startedAtMs: 123, launchNonce: 'private-daemon-nonce' }
  state.busy = false
  state.absent = false
  state.restart.mockReset().mockImplementation(async () => {
    state.identity = { pid: 987654322, startedAtMs: 124, launchNonce: 'replacement-private-nonce' }
    return { killedCount: 2 }
  })
  runtime = new OrcaRuntimeService()
  const dispatcher = new RpcDispatcher({ runtime, methods: DAEMON_RESTART_METHODS })
  state.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await dispatcher.dispatch({ id: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function plan() {
  const response = await state.call('daemon.restartPlan', {})
  return response.result
}
async function restart(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  await main(['terminal', 'daemon', 'restart', '--request-file', file, '--json'], root)
}
it('observes a replacement through public CLI and canonical restart delegation', async () => {
  await main(['terminal', 'daemon', 'restart-plan', '--json'], root)
  const observed = await plan()
  await restart({
    runtimeId: observed.runtimeId,
    executionHostId: observed.executionHostId,
    daemonIdentityDigest: observed.daemonIdentityDigest,
    protocolVersion: observed.protocolVersion,
    scope: observed.scope,
    confirm: true
  })
  expect(process.exitCode).toBeUndefined()
  expect(state.restart).toHaveBeenCalledWith({
    provider: state.adapter,
    identity: { pid: 987654321, startedAtMs: 123, launchNonce: 'private-daemon-nonce' }
  })
  expect(JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0])).result.restarted).toBe(
    true
  )
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-daemon-nonce')
})
it.each(['stale', 'wrong-runtime', 'invalid', 'busy', 'absent', 'replacement-unconfirmed'])(
  'refuses unsafe or unconfirmed daemon restart: %s',
  async (mode) => {
    const observed = await plan()
    const request = {
      runtimeId: observed.runtimeId,
      executionHostId: observed.executionHostId,
      daemonIdentityDigest: observed.daemonIdentityDigest,
      protocolVersion: observed.protocolVersion,
      scope: observed.scope,
      confirm: true
    }
    if (mode === 'stale') {
      request.daemonIdentityDigest = '0'.repeat(64)
    }
    if (mode === 'wrong-runtime') {
      request.runtimeId = 'other-runtime'
    }
    if (mode === 'invalid') {
      request.confirm = false
    }
    if (mode === 'busy') {
      state.busy = true
    }
    if (mode === 'absent') {
      state.absent = true
    }
    if (mode === 'replacement-unconfirmed') {
      state.restart.mockResolvedValue({ killedCount: 0 })
    }
    await restart(request)
    expect(process.exitCode).toBe(1)
    if (mode !== 'replacement-unconfirmed') {
      expect(state.restart).not.toHaveBeenCalled()
    }
  }
)

it('refuses replay of an old plan after the daemon replacement', async () => {
  const observed = await plan()
  const request = {
    runtimeId: observed.runtimeId,
    executionHostId: observed.executionHostId,
    daemonIdentityDigest: observed.daemonIdentityDigest,
    protocolVersion: observed.protocolVersion,
    scope: observed.scope,
    confirm: true
  }
  await restart(request)
  expect(process.exitCode).toBeUndefined()
  await restart(request)
  expect(process.exitCode).toBe(1)
  expect(state.restart).toHaveBeenCalledOnce()
})
it.each(['wrong-meta', 'wrong-request', 'wrong-replacement', 'private-field'])(
  'rejects invalid host restart receipts before printing them: %s',
  async (mode) => {
    const observed = await plan()
    const requested = {
      runtimeId: observed.runtimeId,
      executionHostId: observed.executionHostId,
      daemonIdentityDigest: observed.daemonIdentityDigest,
      protocolVersion: observed.protocolVersion,
      scope: observed.scope,
      confirm: true
    }
    const receipt = {
      requested: {
        ...requested,
        runtimeId: mode === 'wrong-request' ? 'other' : requested.runtimeId
      },
      restarted: true,
      replacement: {
        ...observed,
        runtimeId: mode === 'wrong-replacement' ? 'other' : requested.runtimeId,
        daemonIdentityDigest: '0'.repeat(64)
      },
      interruptedSessionCount: 1,
      processExitConfirmed: false,
      ...(mode === 'private-field' ? { authToken: 'private-unrequested-fixture' } : {})
    }
    state.call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: receipt,
      _meta: { runtimeId: mode === 'wrong-meta' ? 'other' : requested.runtimeId }
    })
    await restart(requested)
    expect(process.exitCode).toBe(1)
    const output = JSON.stringify(vi.mocked(console.log).mock.calls)
    expect(output).not.toContain('private-unrequested-fixture')
    expect(output).toContain('invalid_runtime_response')
  }
)
