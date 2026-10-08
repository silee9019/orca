import * as deliveryDebug from '../../src/main/ipc/pty/delivery/debug'
import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRuntime } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { createPtyIpcSession } from '../../src/main/ipc/pty/session'
import { wirePtyIpcSession } from '../../src/main/ipc/pty/delivery/wire-session'
import { getPtyRendererDeliveryDebugSnapshot } from '../../src/main/ipc/pty/delivery/debug'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  return {
    RuntimeClient: class {
      readonly isRemote = false
      call = mocks.call
    },
    ...errors
  }
})
let root: string
let path: string
let session: ReturnType<typeof createPtyIpcSession>
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-delivery-debug-'))
  path = join(root, 'request.json')
  await writeFile(path, JSON.stringify({ confirm: true }))
  const runtime = createRuntime()
  session = createPtyIpcSession({ runtime })
  wirePtyIpcSession(session)
  session.pendingData.set('fixture-pty', { data: 'private pending text canary', startSeq: 0 })
  session.peakPendingChars = 1000
  session.pendingDroppedChars = 7
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { TERMINAL_DELIVERY_DEBUG_METHODS } =
      await import('../../src/main/runtime/rpc/methods/terminal-delivery-debug')
    const response = await new RpcDispatcher({
      runtime,
      methods: TERMINAL_DELIVERY_DEBUG_METHODS
    }).dispatch({ id: 'delivery-debug', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  session.pendingData.clear()
  session.producerFlowControl.releaseAll()
  session.clearDeliveryResyncProbe()
  session.clearDispatcherReadyWatchdog()
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command(action: string, ...flags: string[]) {
  vi.mocked(console.log).mockClear()
  await main(['terminal', action, ...flags, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(process.exitCode, output).toBeUndefined()
  return JSON.parse(output).result
}
it('reads the canonical host delivery counters without exposing pending text', async () => {
  const before = getPtyRendererDeliveryDebugSnapshot()
  const { snapshot } = await command('delivery-debug')
  expect(snapshot).toMatchObject({
    pendingPtyCount: before.pendingPtyCount,
    pendingChars: before.pendingChars,
    peakPendingChars: before.peakPendingChars,
    pendingDroppedChars: before.pendingDroppedChars
  })
  expect(snapshot.diagnostics.perPty).toEqual(before.diagnostics.perPty)
  expect(before).toMatchObject({
    pendingPtyCount: 1,
    pendingChars: 'private pending text canary'.length,
    peakPendingChars: 1000,
    pendingDroppedChars: 7
  })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
    'private pending text canary'
  )
  expect(session.pendingData.get('fixture-pty')?.data).toBe('private pending text canary')
})
it('resets canonical counters and reseeds peaks without dropping pending output', async () => {
  expect(await command('reset-delivery-debug', '--request-file', path)).toEqual({ reset: true })
  const snapshot = getPtyRendererDeliveryDebugSnapshot()
  expect(snapshot.pendingDroppedChars).toBe(0)
  expect(snapshot.peakPendingChars).toBe('private pending text canary'.length)
  expect(session.pendingData.get('fixture-pty')?.data).toBe('private pending text canary')
})
it('requires explicit confirmation before resetting host counters', async () => {
  await writeFile(path, '{}')
  await main(['terminal', 'reset-delivery-debug', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(mocks.call).not.toHaveBeenCalled()
  expect(getPtyRendererDeliveryDebugSnapshot().pendingDroppedChars).toBe(7)
})
it('fails once against an old host', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  await main(['terminal', 'delivery-debug', '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(mocks.call).toHaveBeenCalledTimes(1)
})

it.each(['delivery-debug', 'reset-delivery-debug'])(
  'refuses %s when the canonical bridge is unavailable',
  async (action) => {
    vi.spyOn(deliveryDebug, 'hasPtyRendererDeliveryDebugBridge').mockReturnValue(false)
    await main(
      [
        'terminal',
        action,
        ...(action === 'reset-delivery-debug' ? ['--request-file', path] : []),
        '--json'
      ],
      root
    )
    expect(process.exitCode).toBe(1)
    expect(getPtyRendererDeliveryDebugSnapshot().pendingDroppedChars).toBe(7)
  }
)
