import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
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
const paneKey = 'status-fixture:11111111-1111-4111-8111-111111111111'
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-status-dismiss-'))
  _internals.resetCachesForTests()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
  const rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: AGENT_STATUS_CLI_METHODS
  })
  state.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'status', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
})
afterEach(async () => {
  _internals.resetCachesForTests()
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
it('dismisses an exact row while retaining resume identity and dropping its launch token', async () => {
  agentHookServer.ingestRemote(
    {
      paneKey,
      tabId: 'status-fixture',
      worktreeId: 'folder-fixture',
      source: 'claude',
      hookEventName: 'UserPromptSubmit',
      launchToken: 'private launch canary',
      providerSession: { key: 'session_id', id: 'fixture-resume' },
      payload: { state: 'working', prompt: 'private prompt canary', agentType: 'claude' }
    },
    'fixture-ssh'
  )
  const row = agentHookServer.getStatusSnapshotForPane(paneKey)[0]
  expect(row?.providerSessionOnly).not.toBe(true)
  if (!row) {
    throw new Error('Missing canonical status fixture')
  }
  const path = join(root, 'dismiss.json')
  await writeFile(
    path,
    JSON.stringify({ paneKey, receivedAt: row.receivedAt, stateStartedAt: row.stateStartedAt })
  )
  await main(['agent', 'status', 'dismiss', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBeUndefined()
  expect(agentHookServer.getStatusSnapshotForPane(paneKey)[0]).toMatchObject({
    providerSessionOnly: true,
    providerSession: { id: 'fixture-resume' }
  })
  expect(agentHookServer.getStatusSnapshotForPane(paneKey)[0]?.launchToken).toBeUndefined()
  const output = JSON.stringify(vi.mocked(console.log).mock.calls)
  expect(output).not.toContain('private prompt canary')
  expect(output).not.toContain('private launch canary')
})
