import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import {
  ADDRESS_X,
  createSessionCallerHarness,
  idOf,
  isRecord,
  orchestrationRequest,
  resultOf,
  SESSION_X,
  SESSION_Y,
  WORKER_HANDLE,
  type SessionCallerHarness
} from '../../src/main/runtime/rpc/orchestration-session-caller-test-fixture'

const hostRef = vi.hoisted((): { current: unknown } => ({ current: null }))
const transport = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/main/native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => hostRef.current
}))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = transport.call
  }
}))
let h: SessionCallerHarness
beforeEach(() => {
  h = createSessionCallerHarness(hostRef)
  vi.stubEnv('ORCA_AGENT_SESSION_ID', SESSION_X)
  vi.stubEnv('ORCA_TERMINAL_HANDLE', '')
  vi.stubEnv('ORCA_PANE_KEY', '')
  transport.call
    .mockReset()
    .mockImplementation(
      async (
        method: string,
        params: Record<string, unknown>,
        options?: { orchestrationRequestId?: string }
      ) => {
        const response = await h.dispatch(
          orchestrationRequest(method, params, {
            sessionId: process.env.ORCA_AGENT_SESSION_ID || undefined,
            requestId: options?.orchestrationRequestId
          })
        )
        if (!response.ok) {
          throw new RuntimeRpcFailureError(response)
        }
        return response
      }
    )
})
afterEach(() => {
  h.close()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = 0
})
async function cli(...args: string[]) {
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = 0
  try {
    await main(['orchestration', ...args, '--json'])
    const text = stdout.mock.calls.map((call) => call.join(' ')).join('\n')
    const parsed: unknown = text ? JSON.parse(text) : null
    return { code: Number(process.exitCode), parsed, text }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
}
async function seed() {
  const run = resultOf((await cli('run-create', '--objective', 'fixture run')).parsed).run
  const runId = idOf(run)
  const task = resultOf((await cli('task-create', '--spec', 'fixture task')).parsed).task
  return { runId, taskId: idOf(task) }
}
it('persists a dispatch from the CLI and reads the same task assignment', async () => {
  const { runId, taskId } = await seed()
  const sent = await cli('dispatch', '--task', taskId, '--to', WORKER_HANDLE)
  expect(sent.code).toBe(0)
  const dispatchId = idOf(resultOf(sent.parsed).dispatch)
  expect(h.db.getDispatchContextById(dispatchId)).toMatchObject({
    task_id: taskId,
    run_id: runId,
    assignee_handle: WORKER_HANDLE,
    creator_orca_session_id: SESSION_X
  })
  const shown = await cli('dispatch-show', '--task', taskId)
  expect(shown.code).toBe(0)
  expect(resultOf(shown.parsed)).toMatchObject({ dispatch: { id: dispatchId } })
})
it('peeks without consuming and acknowledges the exact canonical delivery', async () => {
  const { runId } = await seed()
  const message = h.db.insertMessage({
    from: WORKER_HANDLE,
    to: `run:${runId}`,
    subject: 'private fixture status',
    body: 'private message body',
    runId
  })
  const peek = await cli('check', '--peek')
  expect(peek.code).toBe(0)
  expect(resultOf(peek.parsed)).toMatchObject({ count: 1, messages: [{ id: message.id }] })
  expect(h.db.getMessageById(message.id)?.read).toBe(0)
  const checked = await cli('check')
  const deliveryId = resultOf(checked.parsed).deliveryId
  if (typeof deliveryId !== 'string') {
    throw new Error('Missing canonical delivery')
  }
  expect(resultOf((await cli('check')).parsed)).toMatchObject({ deliveryId, replayed: true })
  expect((await cli('check', '--ack', deliveryId)).code).toBe(0)
  expect(h.db.getDeliveryRaw(deliveryId)?.status).toBe('acknowledged')
  expect(resultOf((await cli('check')).parsed)).toMatchObject({ count: 0 })
})
it('resets only messages, replays the same request and refuses another caller', async () => {
  const { runId, taskId } = await seed()
  const message = h.db.insertMessage({
    from: WORKER_HANDLE,
    to: `run:${runId}`,
    subject: 'fixture message',
    runId
  })
  const args = ['reset', '--messages', '--retry-request', '12345678-1234-4234-8234-123456789abc']
  expect((await cli(...args)).code).toBe(0)
  expect(h.db.getMessageById(message.id)).toBeUndefined()
  expect(h.db.getTask(taskId)).toMatchObject({ id: taskId })
  expect(resultOf((await cli(...args)).parsed)).toMatchObject({ mutation: { replayed: true } })
  const receipt = await cli('request-show', '--request', args[3])
  expect(receipt.code).toBe(0)
  expect(resultOf(receipt.parsed)).toMatchObject({
    requestId: args[3],
    method: 'orchestration.reset'
  })
  vi.stubEnv('ORCA_AGENT_SESSION_ID', SESSION_Y)
  expect((await cli(...args)).parsed).toMatchObject({
    ok: false,
    error: { code: 'request_mismatch' }
  })
})
it('lists the canonical run without claiming an unobserved worker process exited', async () => {
  const { runId, taskId } = await seed()
  const assigned = await cli('dispatch', '--task', taskId, '--to', WORKER_HANDLE)
  const dispatchId = idOf(resultOf(assigned.parsed).dispatch)
  const listed = await cli('worker-list', '--run', runId, '--limit', '10')
  expect(listed.code).toBe(0)
  const result = resultOf(listed.parsed)
  expect(result).toMatchObject({ scope: { run: runId }, page: { hasMore: false } })
  expect(result.workers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        dispatchId,
        taskId,
        runId,
        agentTerminalHandle: WORKER_HANDLE
      })
    ])
  )
})
it('persists one pending worker question and resumes its durable answer', async () => {
  const { runId, taskId } = await seed()
  await cli('dispatch', '--task', taskId, '--to', WORKER_HANDLE)
  vi.stubEnv('ORCA_AGENT_SESSION_ID', '')
  vi.spyOn(h.runtime, 'waitForMessage').mockResolvedValue('timeout')
  const asked = await cli(
    'ask',
    '--from',
    WORKER_HANDLE,
    '--to',
    ADDRESS_X,
    '--question',
    'private fixture question',
    '--timeout-ms',
    '1'
  )
  expect(asked.code).toBe(1)
  const pending = resultOf(asked.parsed)
  expect(pending).toMatchObject({ timedOut: true, answer: null })
  if (typeof pending.messageId !== 'string') {
    throw new Error('Missing durable question id')
  }
  expect(h.db.getQuestion(pending.messageId)).toMatchObject({ run_id: runId, status: 'pending' })
  vi.stubEnv('ORCA_AGENT_SESSION_ID', SESSION_X)
  expect((await cli('reply', '--id', pending.messageId, '--body', 'fixture answer')).code).toBe(0)
  vi.stubEnv('ORCA_AGENT_SESSION_ID', '')
  const resumed = await cli(
    'ask',
    '--from',
    WORKER_HANDLE,
    '--resume',
    pending.messageId,
    '--timeout-ms',
    '1'
  )
  expect(resumed.code).toBe(0)
  expect(resultOf(resumed.parsed)).toMatchObject({ answer: 'fixture answer', timedOut: false })
  expect(h.db.getQuestion(pending.messageId)).toMatchObject({ status: 'answered' })
})
it('refuses retired coordinator verbs and ambiguous destructive read modes before RPC', async () => {
  for (const args of [
    ['coordinator-start'],
    ['coordinator-stop'],
    ['check', '--peek', '--unread']
  ]) {
    transport.call.mockClear()
    const result = await cli(...args)
    expect(result.code).toBe(1)
    expect(isRecord(result.parsed) && result.parsed.ok).toBe(false)
    expect(transport.call).not.toHaveBeenCalled()
  }
})
it('refuses a sibling session caller before touching another inbox', async () => {
  transport.call.mockClear()
  const result = await cli('check', '--terminal', WORKER_HANDLE)
  expect(result.code).toBe(1)
  expect(transport.call).not.toHaveBeenCalled()
})
