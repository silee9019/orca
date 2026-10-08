import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { agentHookServer, _internals } from '../../src/main/agent-hooks/server'
import type { AgentHookStatusRowMutation } from '../../src/main/agent-hooks/server/server-types'
import {
  paneKeyPtyId,
  ptyPaneKey,
  rememberPaneKeyForPty
} from '../../src/main/ipc/pty/pane/key-state'
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
const otherLeafId = '22222222-2222-4222-8222-222222222222'
const ptyId = 'fixture-pty'
let sourceTabId: string
let targetTabId: string
let boundLeafId: string
let sourcePaneKey: string
let targetPaneKey: string
let root: string
let incarnation: string
let host: 'local' | 'ssh:fixture' | 'ssh:other'
let remote: boolean
let onShow: (() => void) | undefined
function ingest(paneKey: string, tabId: string) {
  const envelope: Parameters<typeof agentHookServer.ingestTerminalStatus>[0] = {
    paneKey,
    tabId,
    worktreeId: 'folder:fixture',
    payload: { state: 'working', agentType: 'claude', prompt: 'private transfer canary' }
  }
  if (remote) {
    agentHookServer.ingestRemote(envelope, 'fixture')
  } else {
    agentHookServer.ingestTerminalStatus(envelope)
  }
}
function seed() {
  ingest(sourcePaneKey, sourceTabId)
  const row = agentHookServer.getStatusSnapshot().find((item) => item.paneKey === sourcePaneKey)
  if (!row?.observation) {
    throw new Error('Missing observation fixture')
  }
  return {
    terminal: 'fixture-terminal',
    fromPaneKey: sourcePaneKey,
    toPaneKey: targetPaneKey,
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
  sourceTabId = `transfer-source-${randomUUID()}`
  targetTabId = `transfer-target-${randomUUID()}`
  boundLeafId = leafId
  sourcePaneKey = `${sourceTabId}:${leafId}`
  targetPaneKey = `${targetTabId}:${leafId}`
  root = await mkdtemp(join(tmpdir(), 'orca-cli-transfer-'))
  _internals.resetCachesForTests()
  ptyPaneKey.clear()
  paneKeyPtyId.clear()
  // The PTY keeps its spawn-time pane key after the layout owner detaches its leaf.
  rememberPaneKeyForPty(ptyId, sourcePaneKey)
  incarnation = 'fixture-incarnation'
  host = 'local'
  remote = false
  onShow = undefined
  const runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'showTerminal').mockImplementation(async () => {
    const details = {
      handle: 'fixture-terminal',
      ptyId,
      incarnationId: incarnation,
      worktreeId: 'folder:fixture',
      worktreePath: '/fixture',
      branch: '',
      tabId: targetTabId,
      leafId: boundLeafId,
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
    }).dispatch({ id: 'transfer', method, params, authToken: 'fixture' })
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
  ptyPaneKey.clear()
  paneKeyPtyId.clear()
  process.exitCode = undefined
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function transfer(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  await main(['agent', 'status', 'transfer-pane', '--request-file', file, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(output).not.toContain('private transfer canary')
  return JSON.parse(output)
}
function expectRefusedBy(result: unknown, reason: string) {
  expect(mocks.call).toHaveBeenCalledTimes(1)
  expect(mocks.call).toHaveBeenCalledWith('agentStatus.transferPaneAuthority', expect.anything())
  expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining(reason) } })
}
function snapshotKeys() {
  return agentHookServer.getStatusSnapshot().map((row) => row.paneKey)
}
it('moves the observed canonical row and routes later source-key hooks to the destination', async () => {
  const mutations: AgentHookStatusRowMutation[] = []
  const unsubscribe = agentHookServer.subscribeStatusRowMutations((mutation) =>
    mutations.push(mutation)
  )
  const request = seed()
  mutations.length = 0
  const result = await transfer(request)
  unsubscribe()
  expect(result).toMatchObject({
    ok: true,
    result: { transferred: true, rendererApplied: false }
  })
  expect(snapshotKeys()).toEqual([targetPaneKey])
  expect(agentHookServer.getStatusSnapshot()[0]?.tabId).toBe(targetTabId)
  expect(mutations).toEqual([
    {
      before: expect.objectContaining({ paneKey: sourcePaneKey }),
      after: expect.objectContaining({ paneKey: targetPaneKey })
    }
  ])
  agentHookServer.ingestRemote(
    { paneKey: sourcePaneKey, payload: { state: 'working', agentType: 'claude' } },
    null
  )
  expect(snapshotKeys()).toEqual([targetPaneKey])
})
it('refuses a replay after the source row already moved', async () => {
  const request = seed()
  expect(await transfer(request)).toMatchObject({ ok: true })
  mocks.call.mockClear()
  expectRefusedBy(await transfer(request), 'agent_status_changed')
  expect(snapshotKeys()).toEqual([targetPaneKey])
})
it('refuses when the live terminal is not bound to the destination pane', async () => {
  const request = seed()
  boundLeafId = otherLeafId
  expectRefusedBy(await transfer(request), 'agent_status_pane_owner_changed')
  expect(snapshotKeys()).toEqual([sourcePaneKey])
})
it('refuses when the PTY was never owned by the source pane', async () => {
  const request = seed()
  ptyPaneKey.clear()
  paneKeyPtyId.clear()
  expectRefusedBy(await transfer(request), 'agent_status_transfer_not_owned')
  expect(snapshotKeys()).toEqual([sourcePaneKey])
})
it('refuses to overwrite a destination pane that already has status', async () => {
  const request = seed()
  ingest(targetPaneKey, targetTabId)
  expectRefusedBy(await transfer(request), 'agent_status_destination_occupied')
  expect(snapshotKeys().toSorted()).toEqual([sourcePaneKey, targetPaneKey].toSorted())
})
it('lifts an earlier retirement of the destination like the UI transfer and accepts its later hooks', async () => {
  const request = seed()
  agentHookServer.retirePaneAuthority(targetPaneKey, '33333333-3333-4333-8333-333333333333')
  expect(await transfer(request)).toMatchObject({ ok: true })
  const before = agentHookServer.getStatusSnapshot()[0]
  ingest(targetPaneKey, targetTabId)
  const after = agentHookServer.getStatusSnapshot()
  expect(after.map((row) => row.paneKey)).toEqual([targetPaneKey])
  expect(after[0]?.observation?.revision).toBeGreaterThan(before?.observation?.revision ?? 0)
})
it('refuses a stale status observation before moving authority', async () => {
  const request = seed()
  request.expectedObservation.revision += 1
  expectRefusedBy(await transfer(request), 'agent_status_changed')
  expect(snapshotKeys()).toEqual([sourcePaneKey])
})
it('refuses a different execution host', async () => {
  const request = seed()
  host = 'ssh:other'
  expectRefusedBy(await transfer(request), 'agent_status_pane_owner_changed')
  expect(snapshotKeys()).toEqual([sourcePaneKey])
})
it('refuses a replacement terminal incarnation', async () => {
  const request = seed()
  incarnation = 'replacement'
  expectRefusedBy(await transfer(request), 'terminal_gone')
  expect(snapshotKeys()).toEqual([sourcePaneKey])
})
it('rejects a host rebind during asynchronous identity resolution', async () => {
  const request = seed()
  onShow = () => {
    host = 'ssh:other'
  }
  expectRefusedBy(await transfer(request), 'agent_status_pane_owner_changed')
  expect(snapshotKeys()).toEqual([sourcePaneKey])
})
it('checks SSH row ownership against the explicit terminal host', async () => {
  remote = true
  host = 'ssh:fixture'
  const request = { ...seed(), expectedExecutionHostId: 'ssh:fixture' }
  expect(await transfer(request)).toMatchObject({ ok: true, result: { transferred: true } })
  expect(snapshotKeys()).toEqual([targetPaneKey])
})
it.each([
  { confirm: false },
  { unknown: true },
  { fromPaneKey: 'invalid' },
  { toPaneKey: 'invalid' }
])('rejects malformed requests %j before RPC', async (change) => {
  const request = seed()
  expect(await transfer({ ...request, ...change })).toMatchObject({ ok: false })
  expect(mocks.call).not.toHaveBeenCalled()
})
it('rejects a transfer onto the same pane before RPC', async () => {
  const request = seed()
  expect(await transfer({ ...request, toPaneKey: request.fromPaneKey })).toMatchObject({
    ok: false
  })
  expect(mocks.call).not.toHaveBeenCalled()
})
it('retains explicit old-host refusal without retry', async () => {
  const request = seed()
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await transfer(request)).toMatchObject({ ok: false })
  expect(mocks.call).toHaveBeenCalledTimes(1)
})
