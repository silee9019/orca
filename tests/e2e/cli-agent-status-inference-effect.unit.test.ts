import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { agentHookServer, _internals } from '../../src/main/agent-hooks/server'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { AGENT_STATUS_CLI_METHODS } from '../../src/main/runtime/rpc/methods/agent-status-cli'
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
const paneKey = 'inference-tab:11111111-1111-4111-8111-111111111111'
const prompt = 'private inference baseline canary'
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-status-inference-'))
  _internals.resetCachesForTests()
  const rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: AGENT_STATUS_CLI_METHODS
  })
  state.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'inference', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  process.exitCode = undefined
})
afterEach(async () => {
  _internals.resetCachesForTests()
  process.exitCode = undefined
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
function seed(agentType: string, status: 'working' | 'waiting', toolName?: string) {
  agentHookServer.ingestTerminalStatus({
    paneKey,
    tabId: 'inference-tab',
    worktreeId: 'folder-fixture',
    payload: { state: status, agentType, prompt, ...(toolName ? { toolName } : {}) }
  })
  const row = agentHookServer.getStatusSnapshot().find((entry) => entry.paneKey === paneKey)
  if (!row) {
    throw new Error('Missing canonical row')
  }
  return {
    paneKey,
    baselineUpdatedAt: row.receivedAt,
    baselineStateStartedAt: row.stateStartedAt,
    baselinePrompt: prompt,
    baselineAgentType: agentType
  }
}
async function command(action: string, request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  process.exitCode = undefined
  await main(['agent', 'status', action, '--request-file', file, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(output).not.toContain(prompt)
  return JSON.parse(output)
}
it('preserves canonical double-Escape, navigation and stale-baseline gates', async () => {
  const baseline = seed('opencode', 'working')
  expect(
    await command('infer-interrupt', {
      paneKey: baseline.paneKey,
      baselineUpdatedAt: baseline.baselineUpdatedAt,
      baselineStateStartedAt: baseline.baselineStateStartedAt,
      baselinePrompt: baseline.baselinePrompt,
      intent: 'plain-escape',
      inputCount: 2
    })
  ).toMatchObject({ ok: true, result: { inferred: false } })
  expect(
    await command('infer-interrupt', { ...baseline, intent: 'plain-escape', inputCount: 1 })
  ).toMatchObject({ ok: true, result: { inferred: false } })
  expect(agentHookServer.getStatusSnapshot()[0].state).toBe('working')
  expect(
    await command('infer-interrupt', {
      ...baseline,
      baselineUpdatedAt: baseline.baselineUpdatedAt - 1,
      intent: 'plain-escape',
      inputCount: 2
    })
  ).toMatchObject({ ok: true, result: { inferred: false } })
  expect(
    await command('infer-interrupt', { ...baseline, intent: 'plain-escape', inputCount: 2 })
  ).toMatchObject({ ok: true, result: { inferred: true } })
  expect(agentHookServer.getStatusSnapshot()[0].state).toBe('done')
  const codex = seed('codex', 'working')
  expect(await command('infer-interrupt', { ...codex, intent: 'ctrl-c' })).toMatchObject({
    ok: true,
    result: { inferred: false }
  })
  expect(agentHookServer.getStatusSnapshot()[0].state).toBe('working')
})
it('clears only the same observed interactive Claude question and preserves permission waits', async () => {
  const baseline = seed('claude', 'waiting', 'AskUserQuestion')
  expect(
    await command('infer-question-answered', { ...baseline, baselinePrompt: 'different' })
  ).toMatchObject({ ok: true, result: { inferred: false } })
  expect(await command('infer-question-answered', baseline)).toMatchObject({
    ok: true,
    result: { inferred: true }
  })
  expect(agentHookServer.getStatusSnapshot()[0].state).not.toBe('waiting')
  const permission = seed('claude', 'waiting', 'Bash')
  expect(await command('infer-question-answered', permission)).toMatchObject({
    ok: true,
    result: { inferred: false }
  })
  expect(agentHookServer.getStatusSnapshot()[0].state).toBe('waiting')
})
it('rejects malformed input before RPC and does not retry an old host', async () => {
  const baseline = seed('opencode', 'working')
  expect(await command('infer-interrupt', { ...baseline, intent: 'other' })).toMatchObject({
    ok: false
  })
  expect(state.call).not.toHaveBeenCalled()
  state.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command('infer-question-answered', baseline)).toMatchObject({ ok: false })
  expect(state.call).toHaveBeenCalledExactlyOnceWith('agentStatus.inferQuestionAnswered', baseline)
})
