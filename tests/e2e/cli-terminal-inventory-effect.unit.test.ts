import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createRuntime,
  syncSinglePty
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { TERMINAL_HOST_INVENTORY_METHODS } from '../../src/main/runtime/rpc/methods/terminal-host-inventory'
import { TERMINAL_METHODS } from '../../src/main/runtime/rpc/methods/terminal'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = state.call
  }
  return { RuntimeClient, ...errors }
})
let rpc: RpcDispatcher
let root: string
let runtime: ReturnType<typeof createRuntime>
let size = { cols: 80, rows: 24 }
const resize = vi.fn((_: string, cols: number, rows: number) => {
  size = { cols, rows }
  return true
})
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-terminal-inventory-'))
  runtime = createRuntime()
  size = { cols: 80, rows: 24 }
  resize.mockClear()
  runtime.setPtyController({
    write: () => true,
    kill: () => {
      throw new Error('Unexpected kill')
    },
    getForegroundProcess: async () => null,
    getSize: () => size,
    resize
  })
  syncSinglePty(runtime)
  rpc = new RpcDispatcher({
    runtime,
    methods: [...TERMINAL_METHODS, ...TERMINAL_HOST_INVENTORY_METHODS]
  })
  state.call.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'inventory', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
})
afterEach(async () => {
  await runtime.onPtyExit('pty-1', 0)
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command(name: string) {
  vi.mocked(console.log).mockClear()
  await main(['terminal', name, '--json'], root)
  const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  expect(process.exitCode, String(output)).toBeUndefined()
  return JSON.parse(String(output)).result
}
it('reads canonical fit and driver snapshots without changing geometry or ownership', async () => {
  expect(await command('fit-overrides')).toEqual({ overrides: [] })
  expect(await command('drivers')).toEqual({ drivers: [] })
  await runtime.handleMobileSubscribe('pty-1', 'fixture-phone', { cols: 40, rows: 12 })
  expect(size).toEqual({ cols: 40, rows: 12 })
  const writes = resize.mock.calls.length
  expect(await command('fit-overrides')).toEqual({
    overrides: [{ ptyId: 'pty-1', mode: 'mobile-fit', cols: 40, rows: 12 }]
  })
  expect(await command('drivers')).toEqual({
    drivers: [{ ptyId: 'pty-1', driver: { kind: 'mobile', clientId: 'fixture-phone' } }]
  })
  expect(resize).toHaveBeenCalledTimes(writes)
  await runtime.reclaimTerminalForDesktop('pty-1')
  expect(await command('fit-overrides')).toEqual({ overrides: [] })
  expect(await command('drivers')).toEqual({
    drivers: [{ ptyId: 'pty-1', driver: { kind: 'desktop' } }]
  })
})

it('fails against an older host without changing fit or control state', async () => {
  rpc = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })
  for (const name of ['fit-overrides', 'drivers']) {
    state.call.mockClear()
    vi.mocked(console.log).mockClear()
    await main(['terminal', name, '--json'], root)
    expect(process.exitCode).toBe(1)
    const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
    expect(JSON.parse(String(output))).toMatchObject({
      ok: false,
      error: { code: 'method_not_found' }
    })
    expect(state.call).toHaveBeenCalledTimes(1)
  }
  expect(resize).not.toHaveBeenCalled()
  expect(runtime.getAllTerminalFitOverrides().size).toBe(0)
  expect(runtime.getAllTerminalDrivers().size).toBe(0)
})
