import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { PREFLIGHT_METHODS } from '../../src/main/runtime/rpc/methods/preflight'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  mux: vi.fn(),
  request: vi.fn(),
  disposed: vi.fn()
}))
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
vi.mock('../../src/main/ssh/ssh-target-registry', () => ({
  getActiveMultiplexer: mocks.mux,
  setSshActiveMultiplexerResolver: vi.fn()
}))
let root: string
let path: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-remote-capabilities-'))
  path = join(root, 'request.json')
  await writeFile(path, JSON.stringify({ connectionId: 'fixture-ssh' }))
  mocks.disposed.mockReturnValue(false)
  mocks.request.mockReset().mockResolvedValue({
    hostPlatform: 'win32',
    wslAvailable: true,
    wslDistros: ['Ubuntu'],
    pwshAvailable: true,
    gitBashAvailable: false
  })
  mocks.mux.mockReset().mockReturnValue({ isDisposed: mocks.disposed, request: mocks.request })
  const rpc = new RpcDispatcher({ runtime: new OrcaRuntimeService(), methods: PREFLIGHT_METHODS })
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({
      id: 'remote-capabilities',
      authToken: 'fixture',
      method,
      params
    })
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
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command() {
  vi.mocked(console.log).mockClear()
  await main(['terminal', 'remote-capabilities', '--request-file', path, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(process.exitCode, output).toBeUndefined()
  return JSON.parse(output).result
}
it('reads only the addressed execution host’s active SSH multiplexer', async () => {
  expect(await command()).toEqual({
    hostPlatform: 'win32',
    wslAvailable: true,
    wslDistros: ['Ubuntu'],
    pwshAvailable: true,
    gitBashAvailable: false
  })
  expect(mocks.mux).toHaveBeenCalledWith('fixture-ssh')
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(
    'preflight.detectWindowsTerminalCapabilities',
    {}
  )
})
it.each(['missing', 'disposed', 'old-relay'])(
  'preserves unknown platform for an %s connection',
  async (reason) => {
    if (reason === 'missing') {
      mocks.mux.mockReturnValue(null)
    }
    if (reason === 'disposed') {
      mocks.disposed.mockReturnValue(true)
    }
    if (reason === 'old-relay') {
      mocks.request.mockResolvedValue(undefined)
    }
    expect(await command()).toEqual({
      hostPlatform: null,
      wslAvailable: false,
      wslDistros: [],
      pwshAvailable: false,
      gitBashAvailable: false
    })
    if (reason !== 'old-relay') {
      expect(mocks.request).not.toHaveBeenCalled()
    }
  }
)
it('rejects an empty connection before calling the host', async () => {
  await writeFile(path, JSON.stringify({ connectionId: '' }))
  await main(['terminal', 'remote-capabilities', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(mocks.call).not.toHaveBeenCalled()
})
it('fails once against an old host without probing the client machine', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  await main(['terminal', 'remote-capabilities', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(mocks.call).toHaveBeenCalledTimes(1)
  expect(mocks.request).not.toHaveBeenCalled()
})
