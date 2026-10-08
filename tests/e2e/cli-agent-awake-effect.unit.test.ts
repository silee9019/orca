import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentAwakeService } from '../../src/main/agent-awake-service'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { AGENT_STATUS_CLI_METHODS } from '../../src/main/runtime/rpc/methods/agent-status-cli'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
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
let service: AgentAwakeService | undefined
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-agent-awake-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.call.mockReset()
  process.exitCode = undefined
})
afterEach(async () => {
  service?.dispose()
  service = undefined
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
function bind(runtime: OrcaRuntimeService): void {
  const rpc = new RpcDispatcher({ runtime, methods: AGENT_STATUS_CLI_METHODS })
  state.call.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({
      id: 'awake-fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
}
async function status() {
  vi.mocked(console.log).mockClear()
  await main(['agent', 'awake', 'status', '--json'], root)
  const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof output !== 'string') {
    throw new Error('Missing CLI JSON')
  }
  return JSON.parse(output)
}
it('reads the existing awake service without changing the power assertion', async () => {
  const started = new Set<number>()
  const blocker = {
    start: vi.fn(() => {
      started.add(1)
      return 1
    }),
    stop: vi.fn((id: number) => {
      started.delete(id)
    }),
    isStarted: vi.fn((id: number) => started.has(id))
  }
  const assertion = { start: () => false, stop: () => {}, dispose: () => {} }
  service = new AgentAwakeService({
    blocker,
    linuxAssertion: assertion,
    macosAssertion: assertion,
    powerMonitor: null,
    platform: 'win32',
    now: () => 1000
  })
  const awake = service
  bind(new OrcaRuntimeService(null, undefined, { getAgentAwakeStatus: () => awake.getStatus() }))
  expect((await status()).result.status).toEqual({ mode: 'off', active: false })
  service.setMode('auto')
  service.setStatuses([
    {
      paneKey: 'hydrated-pane',
      state: 'working',
      receivedAt: 1000,
      observedInCurrentRuntime: false
    }
  ])
  expect((await status()).result.status).toEqual({ mode: 'auto', active: false })
  service.setStatuses([
    { paneKey: 'fixture-pane', state: 'working', receivedAt: 1000, observedInCurrentRuntime: true }
  ])
  const starts = blocker.start.mock.calls.length
  expect((await status()).result.status).toEqual({ mode: 'auto', active: true })
  expect((await status()).result.status).toEqual({ mode: 'auto', active: true })
  expect(blocker.start).toHaveBeenCalledTimes(starts)
  expect(process.exitCode).toBeUndefined()
  expect(state.call.mock.calls.every(([method]) => method === 'agentAwake.status')).toBe(true)
})
it('fails explicitly when the execution host has no awake service', async () => {
  bind(new OrcaRuntimeService())
  const output = await status()
  expect(process.exitCode).toBe(1)
  expect(output).toMatchObject({ ok: false, error: { code: 'agent_awake_unavailable' } })
  expect(state.call).toHaveBeenCalledTimes(1)
})
