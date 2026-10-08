import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { agentHookServer, _internals } from '../../src/main/agent-hooks/server'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = mocks.call
  }
}))
const leafId = '11111111-1111-4111-8111-111111111111'
let tabId: string
let paneKey: string
let root: string
let incarnation: string
let host: 'local' | 'ssh:fixture' | 'ssh:other'
let remote: boolean
let onShow: (() => void) | undefined
function ingest() {
  const envelope = {
    paneKey,
    tabId,
    worktreeId: 'folder:fixture',
    payload: { state: 'working', agentType: 'claude', prompt: 'private authority canary' }
  }
  if (remote) {
    agentHookServer.ingestRemote(envelope, 'fixture')
  } else {
    agentHookServer.ingestTerminalStatus(envelope)
  }
}
function seed() {
  ingest()
  const row = agentHookServer.getStatusSnapshot().find((item) => item.paneKey === paneKey)
  if (!row?.observation) {
    throw new Error('Missing observation fixture')
  }
  return {
    terminal: 'fixture-terminal',
    paneKey,
    expectedIncarnationId: 'fixture-incarnation',
    expectedExecutionHostId: 'local',
    receivedAt: row.receivedAt,
    stateStartedAt: row.stateStartedAt,
    expectedObservation: {
      authorityId: row.observation.authorityId,
      incarnation: row.observation.incarnation,
      revision: row.observation.revision
    },
    confirm: true
  }
}
beforeEach(async () => {
  tabId = `authority-${randomUUID()}`
  paneKey = `${tabId}:${leafId}`
  root = await mkdtemp(join(tmpdir(), 'orca-cli-authority-'))
  _internals.resetCachesForTests()
  incarnation = 'fixture-incarnation'
  host = 'local'
  remote = false
  onShow = undefined
  const runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'showTerminal').mockImplementation(async () => {
    const details = {
      handle: 'fixture-terminal',
      ptyId: 'fixture-pty',
      incarnationId: incarnation,
      worktreeId: 'folder:fixture',
      worktreePath: '/fixture',
      branch: '',
      tabId,
      leafId,
      title: null,
      connected: true,
      writable: true,
      lastOutputAt: null,
      preview: '',
      paneRuntimeId: 1,
      rendererGraphEpoch: 1,
      executionHostId: host
    }
    onShow?.()
    return details
  })
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { AGENT_PANE_AUTHORITY_METHODS } =
      await import('../../src/main/runtime/rpc/methods/agent-pane-authority')
    const response = await new RpcDispatcher({
      runtime,
      methods: AGENT_PANE_AUTHORITY_METHODS
    }).dispatch({ id: 'authority', method, params, authToken: 'fixture' })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})
afterEach(async () => {
  _internals.resetCachesForTests()
  process.exitCode = undefined
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function command(action: string, request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  await main(['agent', 'status', action, '--request-file', file, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(output).not.toContain('private authority canary')
  return JSON.parse(output)
}
function restoreRequest(retirementId: string) {
  return {
    terminal: 'fixture-terminal',
    paneKey,
    expectedIncarnationId: 'fixture-incarnation',
    expectedExecutionHostId: 'local',
    retirementId,
    confirm: true
  }
}
it('retires canonical status, suppresses later hooks and restores only its exact retirement', async () => {
  const retired = await command('retire-pane', seed())
  expect(retired).toMatchObject({ ok: true, result: { retired: true } })
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(0)
  ingest()
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(0)
  expect(await command('restore-pane', restoreRequest(retired.result.retirementId))).toMatchObject({
    ok: true,
    result: { restored: true }
  })
  seed()
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(1)
})
it('refuses a stale status observation before fencing', async () => {
  const baseline = seed()
  baseline.expectedObservation.revision += 1
  expect(await command('retire-pane', baseline)).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(1)
})
it('refuses a different execution host', async () => {
  const baseline = seed()
  host = 'ssh:other'
  expect(await command('retire-pane', baseline)).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(1)
})
it('refuses a replacement terminal incarnation', async () => {
  const baseline = seed()
  incarnation = 'replacement'
  expect(await command('retire-pane', baseline)).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(1)
})
it('does not lift a later retirement', async () => {
  const retired = await command('retire-pane', seed())
  agentHookServer.retirePaneAuthority(paneKey, '22222222-2222-4222-8222-222222222222')
  expect(await command('restore-pane', restoreRequest(retired.result.retirementId))).toMatchObject({
    ok: false
  })
  ingest()
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(0)
})
it('preserves a closed-tab fence', async () => {
  const retired = await command('retire-pane', seed())
  agentHookServer.dropStatusEntriesByTabPrefix(tabId)
  expect(await command('restore-pane', restoreRequest(retired.result.retirementId))).toMatchObject({
    ok: false
  })
  ingest()
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(0)
})
it.each([{ confirm: false }, { unknown: true }, { paneKey: 'invalid' }])(
  'rejects malformed confirmed requests %j before RPC',
  async (change) => {
    const baseline = seed()
    expect(await command('retire-pane', { ...baseline, ...change })).toMatchObject({ ok: false })
    expect(mocks.call).not.toHaveBeenCalled()
  }
)
it('retains explicit old-host refusal without retry', async () => {
  const baseline = seed()
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command('retire-pane', baseline)).toMatchObject({ ok: false })
  expect(mocks.call).toHaveBeenCalledTimes(1)
})

it('rejects a host rebind during asynchronous identity resolution', async () => {
  const baseline = seed()
  onShow = () => {
    host = 'ssh:other'
  }
  expect(await command('retire-pane', baseline)).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(1)
})
it('refuses restoration after the terminal moves to another execution host', async () => {
  const retired = await command('retire-pane', seed())
  host = 'ssh:other'
  expect(await command('restore-pane', restoreRequest(retired.result.retirementId))).toMatchObject({
    ok: false
  })
  ingest()
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(0)
})
it('refuses replay after exact restoration already consumed its fence', async () => {
  const retired = await command('retire-pane', seed())
  const request = restoreRequest(retired.result.retirementId)
  expect(await command('restore-pane', request)).toMatchObject({ ok: true })
  expect(await command('restore-pane', request)).toMatchObject({ ok: false })
})
it('checks SSH row ownership against the explicit terminal host', async () => {
  remote = true
  host = 'ssh:fixture'
  const request = { ...seed(), expectedExecutionHostId: 'ssh:fixture' }
  expect(await command('retire-pane', request)).toMatchObject({
    ok: true,
    result: { retired: true }
  })
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(0)
})
it('restores the canonical physical alias together with the owner fence', async () => {
  const physical = `${tabId}:0`
  agentHookServer.registerPaneKeyAlias(physical, paneKey, 'fixture-pty', Date.now(), {
    authorityVerified: true
  })
  const retired = await command('retire-pane', seed())
  expect(retired).toMatchObject({ ok: true })
  expect(await command('restore-pane', restoreRequest(retired.result.retirementId))).toMatchObject({
    ok: true
  })
  agentHookServer.ingestRemote(
    { paneKey: physical, payload: { state: 'working', agentType: 'claude' } },
    null
  )
  expect(agentHookServer.getStatusSnapshot()[0]?.paneKey).toBe(paneKey)
})
