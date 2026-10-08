import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
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
let tabId: string
const leafA = '11111111-1111-4111-8111-111111111111'
const leafB = '22222222-2222-4222-8222-222222222222'
function seed(tab: string, leaf: string) {
  agentHookServer.ingestTerminalStatus({
    paneKey: `${tab}:${leaf}`,
    tabId: tab,
    worktreeId: 'folder-fixture',
    payload: { state: 'working', agentType: 'codex', prompt: 'private retire fixture' }
  })
}
function observedRows() {
  return agentHookServer
    .getStatusSnapshot()
    .filter((row) => row.tabId === tabId)
    .map(({ paneKey, receivedAt, stateStartedAt }) => ({ paneKey, receivedAt, stateStartedAt }))
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-status-retire-tab-'))
  tabId = basename(root)
  _internals.resetCachesForTests()
  seed(tabId, leafA)
  seed(tabId, leafB)
  seed(`${tabId}-neighbor`, leafA)
  const rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: AGENT_STATUS_CLI_METHODS
  })
  state.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'retire', authToken: 'fixture', method, params })
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
  _internals.resetCachesForTests()
  process.exitCode = undefined
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function command(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  process.exitCode = undefined
  await main(['agent', 'status', 'retire-tab', '--request-file', file, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(output).not.toContain('private retire fixture')
  return JSON.parse(output)
}
it('retires only the observed exact tab and suppresses its late status without affecting its neighbor', async () => {
  expect(observedRows()).toHaveLength(2)
  expect(await command({ tabId, confirm: true, observedRows: observedRows() })).toMatchObject({
    ok: true,
    result: { retired: true }
  })
  expect(process.exitCode).toBeUndefined()
  expect(observedRows()).toEqual([])
  seed(tabId, leafA)
  expect(observedRows()).toEqual([])
  expect(agentHookServer.getStatusSnapshot().map((row) => row.tabId)).toEqual([`${tabId}-neighbor`])
})
it('refuses a stale or incomplete observed set without retiring any row', async () => {
  const rows = observedRows()
  expect(await command({ tabId, confirm: true, observedRows: rows.slice(0, 1) })).toMatchObject({
    ok: false
  })
  expect(observedRows()).toEqual(rows)
  expect(await command({ tabId, confirm: true, observedRows: [rows[0], rows[0]] })).toMatchObject({
    ok: false
  })
  expect(observedRows()).toEqual(rows)
  expect(
    await command({
      tabId,
      confirm: true,
      observedRows: rows.map((row) => ({ ...row, receivedAt: row.receivedAt - 1 }))
    })
  ).toMatchObject({ ok: false })
  expect(observedRows()).toEqual(rows)
})
it('requires confirmation and valid tab identity before RPC and returns an old-host error once', async () => {
  const rows = observedRows()
  expect(await command({ tabId, observedRows: rows })).toMatchObject({ ok: false })
  expect(
    await command({ tabId: `${tabId}:invalid`, confirm: true, observedRows: [] })
  ).toMatchObject({ ok: false })
  expect(state.call).not.toHaveBeenCalled()
  state.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  const request = { tabId, confirm: true, observedRows: rows }
  expect(await command(request)).toMatchObject({ ok: false })
  expect(state.call).toHaveBeenCalledExactlyOnceWith('agentStatus.retireTab', request)
})
