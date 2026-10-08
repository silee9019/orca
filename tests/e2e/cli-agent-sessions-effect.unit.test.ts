import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { AGENT_STATUS_CLI_METHODS } from '../../src/main/runtime/rpc/methods/agent-status-cli'
import { agentHookServer, _internals } from '../../src/main/agent-hooks/server'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = callMock
  }
  return { RuntimeClient, ...errors }
})

import { main } from '../../src/cli/index'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { setStructuredAgentSessionHost } from '../../src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import {
  attach,
  envelope,
  hostTestState,
  seedApproval
} from '../../src/main/native-chat/agent-session-wire/structured-agent-session-host-test-harness'
import {
  HOST_TEST_SESSION,
  hostTestMessage
} from '../../src/main/native-chat/agent-session-wire/structured-agent-session-host-test-data'
import { dispatcher } from '../../src/main/runtime/rpc/methods/structured-agent-session-rpc.test-fixture'

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
  setStructuredAgentSessionHost(hostTestState().host)
  const rpc = dispatcher()
  callMock.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'cli-fixture', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  await attach()
})
afterEach(() => {
  setStructuredAgentSessionHost(null)
  process.exitCode = undefined
  vi.restoreAllMocks()
})

async function command(action: string, request: unknown): Promise<void> {
  const file = join(hostTestState().root, 'cli-request.json')
  await writeFile(file, JSON.stringify(request))
  await main(['agent', 'session', action, '--request-file', file, '--json'], hostTestState().root)
}

describe('public agent session CLI over the real host and journal', () => {
  it('sends once, replays the operation and reads the persisted user turn', async () => {
    const body = hostTestMessage('CLI 격리 fixture')
    const request = { envelope: envelope('agentSession.send', { body }), body }
    await command('send', request)
    expect(process.exitCode).toBeUndefined()
    await command('send', request)
    expect(process.exitCode).toBeUndefined()
    await vi.waitFor(() => expect(hostTestState().dispatch).toHaveBeenCalledTimes(1))
    await main(
      [
        'agent',
        'session',
        'history',
        '--session',
        HOST_TEST_SESSION,
        '--direction',
        'tail',
        '--json'
      ],
      hostTestState().root
    )
    expect(process.exitCode).toBeUndefined()
    const page = await hostTestState().host.history({
      sessionId: HOST_TEST_SESSION,
      direction: 'tail'
    })
    expect(page.ok).toBe(true)
    if (!page.ok) {
      throw new Error('History refused')
    }
    expect(page.page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({ blocks: [{ type: 'text', text: 'CLI 격리 fixture' }] })
        })
      ])
    )
  })
  it('commits an approval at the observed revision and rejects a different stale response', async () => {
    const body = hostTestMessage('request approval')
    await command('send', { envelope: envelope('agentSession.send', { body }), body })
    await vi.waitFor(() => expect(hostTestState().dispatch).toHaveBeenCalledTimes(1))
    const prompt = await seedApproval()
    const fields = { itemId: prompt.itemId, expectedRevision: prompt.revision, optionId: 'allow' }
    await command('respond-approval', {
      envelope: envelope('agentSession.respondTo:approval', fields),
      ...fields
    })
    expect(process.exitCode).toBeUndefined()
    expect(hostTestState().answerPrompt).toHaveBeenCalledTimes(1)
    const stale = { ...fields, optionId: 'deny' }
    await command('respond-approval', {
      envelope: envelope('agentSession.respondTo:approval', stale),
      ...stale
    })
    expect(process.exitCode).toBe(1)
    expect(hostTestState().answerPrompt).toHaveBeenCalledTimes(1)
  })
})

it('dismisses the same canonical row through the public status CLI', async () => {
  _internals.resetCachesForTests()
  const rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: AGENT_STATUS_CLI_METHODS
  })
  callMock.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'cli-fixture', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  const paneKey = 'cli-tab:11111111-1111-4111-8111-111111111111'
  try {
    agentHookServer.ingestTerminalStatus({
      paneKey,
      tabId: 'cli-tab',
      worktreeId: 'folder-fixture',
      payload: { state: 'done', agentType: 'codex', prompt: 'secret status canary' }
    })
    const row = agentHookServer.getStatusSnapshot()[0]
    if (!row) {
      throw new Error('Missing canonical status fixture')
    }
    await main(['agent', 'status', 'list', '--json'], hostTestState().root)
    expect(process.exitCode).toBeUndefined()
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('secret status canary')
    const file = join(hostTestState().root, 'dismiss-request.json')
    await writeFile(
      file,
      JSON.stringify({ paneKey, receivedAt: row.receivedAt, stateStartedAt: row.stateStartedAt })
    )
    await main(
      ['agent', 'status', 'dismiss', '--request-file', file, '--json'],
      hostTestState().root
    )
    expect(process.exitCode).toBeUndefined()
    expect(agentHookServer.getStatusSnapshot()).toEqual([])
  } finally {
    _internals.resetCachesForTests()
  }
})

it('reports whether the execution host holds saved chats without launching an agent', async () => {
  const rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: AGENT_STATUS_CLI_METHODS
  })
  callMock.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'held', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  const record = hostTestState().store.getRecord(HOST_TEST_SESSION)
  for (const held of [false, true, false]) {
    setStructuredAgentSessionHost(held ? hostTestState().host : null)
    vi.mocked(console.log).mockClear()
    await main(['agent', 'session', 'held', '--json'], hostTestState().root)
    expect(process.exitCode).toBeUndefined()
    const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
    expect(typeof output).toBe('string')
    expect(JSON.parse(String(output)).result).toEqual({ held })
  }
  expect(hostTestState().store.getRecord(HOST_TEST_SESSION)).toEqual(record)
  expect(hostTestState().dispatch).not.toHaveBeenCalled()
})

it('returns an old-host error for the held-record query without a fallback', async () => {
  callMock.mockReset().mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  await main(['agent', 'session', 'held', '--json'], hostTestState().root)
  expect(process.exitCode).toBe(1)
  expect(callMock).toHaveBeenCalledExactlyOnceWith('agentSession.held', {})
})
