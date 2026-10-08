import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { TERMINAL_STARTUP_RESTORATION_METHODS } from '../../src/main/runtime/rpc/methods/terminal-startup-restoration'

const mocks = vi.hoisted(
  (): {
    call: ReturnType<typeof vi.fn>
    state: {
      runtime: OrcaRuntimeService | null
      firstWindowStartupServicesReady: Promise<void>
      managedWslCliStartupBarrierReady: Promise<void>
    }
  } => ({
    call: vi.fn(),
    state: {
      runtime: null,
      firstWindowStartupServicesReady: Promise.resolve(),
      managedWslCliStartupBarrierReady: Promise.resolve()
    }
  })
)
vi.mock('../../src/main/startup/main-process-state', () => ({ mainProcessState: mocks.state }))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = mocks.call
  }
}))
let root: string
let runtime: OrcaRuntimeService
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-startup-preparation-'))
  runtime = new OrcaRuntimeService()
  mocks.state.runtime = runtime
  mocks.state.firstWindowStartupServicesReady = Promise.resolve()
  mocks.state.managedWslCliStartupBarrierReady = Promise.resolve()
  vi.spyOn(runtime, 'prepareStructuredAgentSessionStartupRestoration').mockResolvedValue()
  const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_STARTUP_RESTORATION_METHODS })
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
})
afterEach(async () => {
  mocks.state.runtime = null
  await rm(root, { recursive: true, force: true })
  vi.restoreAllMocks()
  process.exitCode = 0
})
async function cli(request: unknown = { confirm: true }) {
  const path = join(root, 'request.json')
  await writeFile(path, JSON.stringify(request), { mode: 0o600 })
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = 0
  try {
    await main(['terminal', 'prepare-startup', '--request-file', path, '--json'])
    const text = stdout.mock.calls.map((call) => call.join(' ')).join('\n')
    const parsed: unknown = text ? JSON.parse(text) : null
    return { code: Number(process.exitCode), parsed }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
}
it('awaits both host startup barriers before the canonical preparation call', async () => {
  let readyServices: (() => void) | undefined
  let readyWsl: (() => void) | undefined
  mocks.state.firstWindowStartupServicesReady = new Promise<void>((resolve) => {
    readyServices = resolve
  })
  mocks.state.managedWslCliStartupBarrierReady = new Promise<void>((resolve) => {
    readyWsl = resolve
  })
  const pending = cli()
  await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledOnce())
  expect(runtime.prepareStructuredAgentSessionStartupRestoration).not.toHaveBeenCalled()
  if (!readyServices || !readyWsl) {
    throw new Error('Missing startup barrier fixture')
  }
  readyServices()
  await Promise.resolve()
  expect(runtime.prepareStructuredAgentSessionStartupRestoration).not.toHaveBeenCalled()
  readyWsl()
  expect(await pending).toMatchObject({
    code: 0,
    parsed: { result: { preparationCompleted: true } }
  })
  expect(runtime.prepareStructuredAgentSessionStartupRestoration).toHaveBeenCalledOnce()
})
it.each(['missing', 'different'])('refuses a %s startup owner', async (owner) => {
  mocks.state.runtime = owner === 'missing' ? null : new OrcaRuntimeService()
  expect((await cli()).code).toBe(1)
  expect(runtime.prepareStructuredAgentSessionStartupRestoration).not.toHaveBeenCalled()
})
it('propagates a preparation error without claiming successful restoration', async () => {
  vi.mocked(runtime.prepareStructuredAgentSessionStartupRestoration).mockRejectedValue(
    new Error('fixture startup refused')
  )
  expect((await cli()).code).toBe(1)
})
it.each([{}, { confirm: false }, { confirm: true, host: 'other' }])(
  'refuses an unconfirmed or expanded request before RPC: %j',
  async (request) => {
    expect((await cli(request)).code).toBe(1)
    expect(mocks.call).not.toHaveBeenCalled()
  }
)
it('surfaces an old-host error exactly once without a fallback', async () => {
  mocks.call.mockImplementation(async () => {
    throw new RuntimeRpcFailureError({
      id: 'fixture',
      ok: false,
      error: { code: 'method_not_found', message: 'fixture old host' }
    })
  })
  expect((await cli()).code).toBe(1)
  expect(mocks.call).toHaveBeenCalledTimes(1)
  expect(runtime.prepareStructuredAgentSessionStartupRestoration).not.toHaveBeenCalled()
})

it('refuses a different owner after the startup barrier completes', async () => {
  let release: (() => void) | undefined
  mocks.state.firstWindowStartupServicesReady = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = cli()
  await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledOnce())
  mocks.state.runtime = new OrcaRuntimeService()
  if (!release) {
    throw new Error('Missing barrier fixture')
  }
  release()
  expect((await pending).code).toBe(1)
  expect(runtime.prepareStructuredAgentSessionStartupRestoration).not.toHaveBeenCalled()
})
it('propagates a rejected startup barrier before preparing any session', async () => {
  let reject: ((error: Error) => void) | undefined
  mocks.state.firstWindowStartupServicesReady = new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise
  })
  const pending = cli()
  await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledOnce())
  if (!reject) {
    throw new Error('Missing barrier rejection fixture')
  }
  reject(new Error('fixture startup failure'))
  expect((await pending).code).toBe(1)
  expect(runtime.prepareStructuredAgentSessionStartupRestoration).not.toHaveBeenCalled()
})
