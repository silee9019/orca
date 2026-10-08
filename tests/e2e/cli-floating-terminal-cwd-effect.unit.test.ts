import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { app } from 'electron'
import { mkdtemp, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Store } from '../../src/main/persistence/loading-store/store'
import { resolveFloatingTerminalCwd } from '../../src/main/ipc/floating-workspace-directory'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { TERMINAL_HOST_DETAILS_METHODS } from '../../src/main/runtime/rpc/methods/terminal-host-details'
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
let root: string
let home: string
let userData: string
let trusted: string
let store: Store
let rpc: RpcDispatcher
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-floating-cwd-'))
  home = join(root, 'home')
  userData = join(root, 'profile')
  trusted = join(root, 'trusted')
  await Promise.all([mkdir(home), mkdir(trusted)])
  trusted = await realpath(trusted)
  vi.spyOn(app, 'getPath').mockImplementation((name) => {
    if (name === 'home') {
      return home
    }
    if (name === 'userData') {
      return userData
    }
    throw new Error('Unexpected app path')
  })
  store = new Store({
    dataFile: join(root, 'frozen-profile.json'),
    serializedState: JSON.stringify({ settings: { floatingTerminalTrustedCwds: [trusted] } })
  })
  rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store, undefined, {
      resolveFloatingTerminalCwd: (args) => resolveFloatingTerminalCwd(store, args)
    }),
    methods: TERMINAL_HOST_DETAILS_METHODS
  })
  state.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'floating', authToken: 'fixture', method, params })
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
  process.exitCode = undefined
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function command(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  await main(['terminal', 'floating-cwd', '--request-file', file, '--json'], root)
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}
it('uses host trust policy and creates only the isolated fallback directory', async () => {
  const settings = structuredClone(store.getSettings())
  expect(await command({})).toMatchObject({ ok: true, result: { cwd: home } })
  expect(process.exitCode).toBeUndefined()
  expect(await command({ path: trusted, requireTrusted: true })).toMatchObject({
    ok: true,
    result: { cwd: trusted }
  })
  const safe = join(userData, 'floating-workspace')
  expect(await command({ path: home, requireTrusted: true })).toMatchObject({
    ok: true,
    result: { cwd: safe }
  })
  expect((await stat(safe)).isDirectory()).toBe(true)
  expect(await command({ path: join(root, 'missing'), requireTrusted: true })).toMatchObject({
    ok: true,
    result: { cwd: safe }
  })
  expect(store.getSettings()).toEqual(settings)
})
it('refuses unavailable host policy and invalid input without a client fallback', async () => {
  rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: TERMINAL_HOST_DETAILS_METHODS
  })
  expect(await command({})).toMatchObject({ ok: false })
  expect(process.exitCode).toBe(1)
  state.call.mockClear()
  expect(await command({ requireTrusted: 'yes' })).toMatchObject({ ok: false })
  expect(state.call).not.toHaveBeenCalled()
})
it('returns an old-host error after one request', async () => {
  state.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command({})).toMatchObject({ ok: false })
  expect(process.exitCode).toBe(1)
  expect(state.call).toHaveBeenCalledExactlyOnceWith('terminal.floatingCwd', {})
})
