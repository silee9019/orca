import { z } from 'zod'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from '../../src/cli/args'
import { CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS } from '../../src/cli/specs/codex-account-observe'
import { CODEX_ACCOUNT_OBSERVE_HANDLERS } from '../../src/cli/handlers/codex-account-observe'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ACCOUNT_METHODS } from '../../src/main/runtime/rpc/methods/accounts'
import { buildRegistry, defineMethod, type RpcContext } from '../../src/main/runtime/rpc/core'
import {
  observeCodexAccountState,
  type CodexObservation
} from '../../src/cli/codex-account-observer'
const exitCode = process.exitCode
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  process.exitCode = exitCode
})
function context() {
  const parsed = parseArgs(
    ['accounts', 'observe-codex', '--timeout', '1000', '--interval', '250', '--json'],
    CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS.map((s) => s.path),
    CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS
  )
  const client = new RuntimeClient('/fixture-no-runtime', 1000, null, null)
  return { flags: parsed.flags, client, cwd: '/fixture-no-runtime', json: true }
}
const safeState: CodexObservation = {
  accounts: { accounts: [], activeAccountId: null },
  login: { status: 'idle', browserAuthorizationPending: false }
}
it('polls actual account RPC snapshots and pending-link transitions with finite end and no secret fields', async () => {
  vi.useFakeTimers()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const ctx = context()
  let pending = false
  let selected: string | null = null
  const list = vi.fn(() => ({
    codex: {
      accounts: [
        {
          id: 'fixture-id',
          email: 'private-email-marker',
          managedHomePath: 'private-path-marker',
          updatedAt: 1
        }
      ],
      activeAccountId: selected
    },
    claude: { accounts: [], activeAccountId: null },
    rateLimits: {}
  }))
  const manageAccountLogin = vi.fn(async (input: unknown) => {
    expect(input).toEqual({ provider: 'codex', action: 'status' })
    return {
      status: pending ? 'pending' : 'idle',
      browserAuthorizationPending: pending,
      privateUrl: 'private-url-marker'
    }
  })
  // This fixed fixture mirrors the parent-owned account-login.ts status method contract.
  const loginStatus = defineMethod({
    name: 'accounts.loginStatus',
    params: z.object({ provider: z.enum(['claude', 'codex']) }).strict(),
    handler: async (params, { clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Host runtime required')
      }
      return manageAccountLogin({ ...params, action: 'status' })
    }
  })
  const registry = buildRegistry([...ACCOUNT_METHODS, loginStatus])
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: accounts.list reads only getAccountsSnapshot; fixture never constructs an account service or executes login.
  const rpcContext = { runtime: { getAccountsSnapshot: list } } as unknown as RpcContext
  const calls = vi.spyOn(ctx.client, 'call').mockImplementation(async (name, params, options) => {
    expect(options?.timeoutMs).toBeLessThanOrEqual(1000)
    if (name === 'accounts.list') {
      expect(params).toEqual({ refreshUsage: false })
    } else {
      expect(name).toBe('accounts.loginStatus')
      expect(params).toEqual({ provider: 'codex' })
    }
    const method = registry.get(name)
    if (!method || 'stream' in method) {
      throw new Error('missing RPC')
    }
    return {
      ok: true,
      id: 'fixture',
      _meta: { runtimeId: 'fixture-host' },
      result: await method.handler(method.params?.parse(params), rpcContext)
    }
  })
  const initialSignals = process.listenerCount('SIGINT')
  const finished = CODEX_ACCOUNT_OBSERVE_HANDLERS['accounts observe-codex'](ctx)
  await vi.advanceTimersByTimeAsync(0)
  pending = true
  await vi.advanceTimersByTimeAsync(250)
  selected = 'fixture-id'
  await vi.advanceTimersByTimeAsync(250)
  pending = false
  await vi.advanceTimersByTimeAsync(250)
  await vi.advanceTimersByTimeAsync(250)
  await finished
  const output = log.mock.calls.map(([s]) => JSON.parse(String(s)))
  expect(output.map((e) => e.event)).toEqual(['snapshot', 'changed', 'changed', 'changed', 'end'])
  expect(output[1].state.login.browserAuthorizationPending).toBe(true)
  expect(output[2].state.accounts.activeAccountId).toBe('fixture-id')
  expect(output[3].state.login.browserAuthorizationPending).toBe(false)
  expect(output[4].reason).toBe('timeout')
  expect(JSON.stringify(output)).not.toContain('private-')
  expect(calls).toHaveBeenCalledTimes(8)
  expect(list).toHaveBeenCalledTimes(4)
  expect(manageAccountLogin).toHaveBeenCalledTimes(4)
  expect(process.listenerCount('SIGINT')).toBe(initialSignals)
  expect(vi.getTimerCount()).toBe(0)
})
it('cancels on SIGINT, suppresses a late response, and cleans process listeners and timers', async () => {
  vi.useFakeTimers()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const ctx = context()
  let release: ((value: Awaited<ReturnType<RuntimeClient['call']>>) => void) | undefined
  vi.spyOn(ctx.client, 'call').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  const previous = process.listeners('SIGINT')
  const finished = CODEX_ACCOUNT_OBSERVE_HANDLERS['accounts observe-codex'](ctx)
  const listener = process.listeners('SIGINT').find((l) => !previous.includes(l))
  expect(listener).toBeDefined()
  listener?.('SIGINT')
  await finished
  expect(log).toHaveBeenCalledTimes(1)
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
    event: 'end',
    reason: 'cancelled'
  })
  expect(process.listeners('SIGINT')).toEqual(previous)
  expect(vi.getTimerCount()).toBe(0)
  release?.({
    ok: true,
    id: 'late',
    _meta: { runtimeId: 'fixture-host' },
    result: { codex: { accounts: [], activeAccountId: null } }
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(log).toHaveBeenCalledTimes(1)
})
it('rejects out-of-bounds durations before any RPC or signal registration', async () => {
  const ctx = context()
  ctx.flags.set('timeout', '0')
  const call = vi.spyOn(ctx.client, 'call')
  const before = process.listeners('SIGINT')
  await expect(CODEX_ACCOUNT_OBSERVE_HANDLERS['accounts observe-codex'](ctx)).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  expect(process.listeners('SIGINT')).toEqual(before)
})
it('propagates unavailable and mixed-version errors without inventing a state transition', async () => {
  vi.useFakeTimers()
  const ctx = context()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(ctx.client, 'call').mockRejectedValue(new Error('method_not_found'))
  const before = process.listeners('SIGINT')
  await expect(CODEX_ACCOUNT_OBSERVE_HANDLERS['accounts observe-codex'](ctx)).rejects.toThrow(
    'method_not_found'
  )
  expect(log).not.toHaveBeenCalled()
  expect(process.listeners('SIGINT')).toEqual(before)
  expect(vi.getTimerCount()).toBe(0)
})
it('suppresses unchanged samples and accepts an already-aborted signal', async () => {
  vi.useFakeTimers()
  const emit = vi.fn()
  const read = vi.fn(async () => safeState)
  const controller = new AbortController()
  controller.abort()
  await observeCodexAccountState(read, emit, {
    timeoutMs: 1000,
    intervalMs: 250,
    signal: controller.signal
  })
  expect(read).not.toHaveBeenCalled()
  expect(emit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ event: 'end', reason: 'cancelled' })
  )
  expect(vi.getTimerCount()).toBe(0)
})
