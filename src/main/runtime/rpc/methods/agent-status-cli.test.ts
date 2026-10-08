import '../unused-default-rpc-methods.test-fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentHookServer, _internals } from '../../../agent-hooks/server'
import { RpcDispatcher } from '../dispatcher'
import { OrcaRuntimeService } from '../../orca-runtime'
import { AGENT_STATUS_CLI_METHODS } from './agent-status-cli'

const paneKey = 'tab-fixture:11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  _internals.resetCachesForTests()
  vi.spyOn(Date, 'now').mockReturnValue(1000)
  agentHookServer.ingestTerminalStatus({
    paneKey,
    tabId: 'tab-fixture',
    worktreeId: 'folder-fixture',
    payload: { state: 'working', agentType: 'codex', prompt: 'private canary' }
  })
})
afterEach(() => {
  _internals.resetCachesForTests()
  vi.restoreAllMocks()
})

async function call(method: string, params?: unknown) {
  const runtime = new OrcaRuntimeService()
  return new RpcDispatcher({ runtime, methods: AGENT_STATUS_CLI_METHODS }).dispatch({
    id: 'fixture',
    authToken: 'fixture',
    method,
    params
  })
}

describe('canonical agent status CLI', () => {
  it('reads only metadata from the canonical store without publishing private prompts', async () => {
    const row = agentHookServer.getStatusSnapshot()[0]
    if (!row) {
      throw new Error('Missing seeded row')
    }
    vi.spyOn(agentHookServer, 'getStatusSnapshot').mockReturnValue([
      { ...row, launchToken: 'token-canary' }
    ])
    const response = await call('agentStatus.list', {})
    expect(response.ok).toBe(true)
    expect(JSON.stringify(response)).toContain(paneKey)
    expect(JSON.stringify(response)).not.toContain('private canary')
    expect(JSON.stringify(response)).not.toContain('token-canary')
  })
  it('dismisses an exact observed row in the same store', async () => {
    const row = agentHookServer.getStatusSnapshot()[0]
    if (!row) {
      throw new Error('Missing seeded row')
    }
    const response = await call('agentStatus.dismiss', {
      paneKey,
      receivedAt: row.receivedAt,
      stateStartedAt: row.stateStartedAt
    })
    expect(response.ok).toBe(true)
    expect(agentHookServer.getStatusSnapshot()).toEqual([])
  })
  it('keeps a newer row when a stale dismissal is submitted', async () => {
    const response = await call('agentStatus.dismiss', {
      paneKey,
      receivedAt: 999,
      stateStartedAt: 1000
    })
    expect(response.ok).toBe(false)
    expect(agentHookServer.getStatusSnapshot()).toHaveLength(1)
  })
})
