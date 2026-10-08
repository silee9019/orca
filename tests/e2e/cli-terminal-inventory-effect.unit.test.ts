import { Store } from '../../src/main/persistence/loading-store/store'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { getDefaultWorkspaceSession } from '../../src/shared/constants'
import { TERMINAL_SIDE_EFFECT_SNAPSHOT_METHODS } from '../../src/main/runtime/rpc/methods/terminal-side-effect-snapshot'
import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    methods: [
      ...TERMINAL_METHODS,
      ...TERMINAL_HOST_INVENTORY_METHODS,
      ...TERMINAL_SIDE_EFFECT_SNAPSHOT_METHODS
    ]
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
async function command(...args: string[]) {
  vi.mocked(console.log).mockClear()
  await main(['terminal', ...args, '--json'], root)
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
  for (const name of ['fit-overrides', 'drivers', 'workspace-hosts']) {
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
  await writeFile(join(root, 'old-host.json'), JSON.stringify({ terminal: 'fixture' }))
  state.call.mockClear()
  vi.mocked(console.log).mockClear()
  await main(
    ['terminal', 'side-effects', '--request-file', join(root, 'old-host.json'), '--json'],
    root
  )
  expect(process.exitCode).toBe(1)
  expect(JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))).toMatchObject({
    ok: false,
    error: { code: 'method_not_found' }
  })
  expect(state.call).toHaveBeenCalledTimes(1)
  expect(resize).not.toHaveBeenCalled()
  expect(runtime.getAllTerminalFitOverrides().size).toBe(0)
  expect(runtime.getAllTerminalDrivers().size).toBe(0)
})

it('reads only the current title side effect without replaying attention and rejects an exited target', async () => {
  const handle = (await runtime.listTerminals()).terminals[0].handle
  const path = join(root, 'target.json')
  await writeFile(path, JSON.stringify({ terminal: handle }))
  expect(await command('side-effects', '--request-file', path)).toEqual({ snapshot: null })
  runtime.onPtyData('pty-1', '\x1b]0;fixture title\x07\x07', 1)
  const expected = runtime.getTerminalSideEffectSnapshot('pty-1')
  expect(expected).toMatchObject({ replay: true, facts: [{ kind: 'title' }] })
  expect(expected?.facts).toHaveLength(1)
  runtime.markPtyLivenessUnverifiable('pty-1')
  expect((await command('side-effects', '--request-file', path)).snapshot).toEqual(expected)
  expect(runtime.getTerminalSideEffectSnapshot('pty-1')).toEqual(expected)
  await runtime.onPtyExit('pty-1', 0)
  vi.mocked(console.log).mockClear()
  await main(['terminal', 'side-effects', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))).toMatchObject({
    ok: false,
    error: { code: 'terminal_gone' }
  })
})

it('enumerates persisted SSH and paired host partitions without a repository catalog or session content', async () => {
  const session = getDefaultWorkspaceSession()
  const store = new Store({
    dataFile: join(root, 'isolated-profile.json'),
    serializedState: JSON.stringify({
      workspaceSession: session,
      workspaceSessionsByHostId: {
        'ssh:folder-only': session,
        'runtime:peer-only': session,
        invalid: session
      }
    })
  })
  runtime = new OrcaRuntimeService(store)
  rpc = new RpcDispatcher({
    runtime,
    methods: [
      ...TERMINAL_METHODS,
      ...TERMINAL_HOST_INVENTORY_METHODS,
      ...TERMINAL_SIDE_EFFECT_SNAPSHOT_METHODS
    ]
  })
  const before = store.getWorkspaceSessionHostIds()
  expect(before).toEqual(['local', 'ssh:folder-only', 'runtime:peer-only'])
  expect(store.getRepos()).toEqual([])
  expect(await command('workspace-hosts')).toEqual({ hostIds: before })
  expect(store.getWorkspaceSessionHostIds()).toEqual(before)
  expect(store.getWorkspaceSession('ssh:folder-only')).toEqual(session)
})

it('refuses a host census when the addressed runtime has no persistence store', async () => {
  runtime = new OrcaRuntimeService()
  rpc = new RpcDispatcher({ runtime, methods: TERMINAL_HOST_INVENTORY_METHODS })
  await main(['terminal', 'workspace-hosts', '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))).toMatchObject({
    ok: false,
    error: { code: 'runtime_unavailable' }
  })
})
