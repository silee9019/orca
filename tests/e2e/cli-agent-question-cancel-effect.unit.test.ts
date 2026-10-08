import type { StructuredAgentSessionAdapter } from '../../src/main/native-chat/agent-session-wire/structured-agent-session-adapter'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../src/shared/agent-session-journal-types'
import { agentJournalItemKey } from '../../src/shared/agent-session-journal-item-key'
import { encodeAgentSessionQuestionAnswers } from '../../src/shared/agent-session-question-answer'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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
  HOST_TEST_THREAD,
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

async function seedQuestion() {
  const state = hostTestState()
  const identity = {
    provider: 'codex' as const,
    threadId: HOST_TEST_THREAD,
    turnId: 'turn-1',
    ordinal: 100
  }
  const events = state.acquire.mock.calls.at(-1)?.[0].events
  if (!events) {
    throw new Error('Missing acquired session')
  }
  events.appendItem(
    identity,
    {
      kind: 'question',
      question: 'Choose targets and host',
      options: [],
      questions: [
        {
          id: 'q1',
          question: 'Targets',
          multiSelect: true,
          options: [
            { id: 'web', label: 'Web' },
            { id: 'mobile', label: 'Mobile' }
          ]
        },
        { id: 'q2', question: 'Host', multiSelect: false, options: [], freeTextQuestionId: 'q2' }
      ],
      resolution: { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null }
    },
    { turnScope: AGENT_JOURNAL_THREAD_SCOPE }
  )
  await state.host.flushStreamedEvents(HOST_TEST_SESSION)
  const page = await state.host.history({ sessionId: HOST_TEST_SESSION, direction: 'tail' })
  const prompt = page.ok
    ? page.page.items.find((item) => item.itemId === agentJournalItemKey(identity))
    : undefined
  if (!prompt) {
    throw new Error('Missing question journal item')
  }
  return { itemId: prompt.itemId, expectedRevision: prompt.revision }
}

it.each(['structured', 'packed'])(
  'commits grouped %s answers once without echoing private free text',
  async (mode) => {
    const body = hostTestMessage('Open question')
    await command('send', { envelope: envelope('agentSession.send', { body }), body })
    await vi.waitFor(() => expect(hostTestState().dispatch).toHaveBeenCalledTimes(1))
    const target = await seedQuestion()
    const answers = [
      { questionId: 'q1', optionIds: ['web', 'mobile'] },
      { questionId: 'q2', optionIds: [], other: 'private 응답 canary' }
    ]
    const fields = {
      ...target,
      ...(mode === 'structured'
        ? { answers }
        : { optionId: encodeAgentSessionQuestionAnswers(answers) })
    }
    const request = { envelope: envelope('agentSession.respondTo:question', fields), ...fields }
    vi.mocked(console.log).mockClear()
    await command('respond-question', request)
    expect(process.exitCode).toBeUndefined()
    expect(hostTestState().answerPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ response: { kind: 'answers', answers } })
    )
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private 응답 canary')
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      encodeAgentSessionQuestionAnswers(answers)
    )
    const page = await hostTestState().host.history({
      sessionId: HOST_TEST_SESSION,
      direction: 'tail'
    })
    expect(
      page.ok && page.page.items.find((item) => item.itemId === target.itemId)?.body
    ).toMatchObject({ resolution: { state: 'resolved', answers } })
    await command('respond-question', request)
    expect(process.exitCode).toBeUndefined()
    expect(hostTestState().answerPrompt).toHaveBeenCalledTimes(1)
    const stale = {
      ...target,
      answers: [
        { questionId: 'q1', optionIds: ['web'] },
        { questionId: 'q2', optionIds: [], other: 'different' }
      ]
    }
    await command('respond-question', {
      envelope: envelope('agentSession.respondTo:question', stale),
      ...stale
    })
    expect(process.exitCode).toBe(1)
    expect(hostTestState().answerPrompt).toHaveBeenCalledTimes(1)
  }
)

it('cancels only the observed prompt revision and never interrupts twice on replay', async () => {
  const prompt = await seedApproval()
  const fields = {
    turnId: 'turn-1',
    prompt: { itemId: prompt.itemId, expectedRevision: prompt.revision + 1 }
  }
  await command('cancel', { envelope: envelope('agentSession.cancel', fields), ...fields })
  expect(process.exitCode).toBe(1)
  expect(hostTestState().cancelTurn).not.toHaveBeenCalled()
  process.exitCode = undefined
  fields.prompt.expectedRevision = prompt.revision
  const request = { envelope: envelope('agentSession.cancel', fields), ...fields }
  await command('cancel', request)
  expect(process.exitCode).toBeUndefined()
  expect(hostTestState().cancelTurn).toHaveBeenCalledTimes(1)
  await command('cancel', request)
  expect(process.exitCode).toBeUndefined()
  expect(hostTestState().cancelTurn).toHaveBeenCalledTimes(1)
})

it('applies set, status and clear goals once and preserves the objective in the real journal', async () => {
  const changeGoal = vi.fn<NonNullable<StructuredAgentSessionAdapter['changeThreadGoal']>>(
    async () => ({ ok: true })
  )
  hostTestState().host.deps.adapter.changeThreadGoal = changeGoal
  const changes = [
    { kind: 'set', objective: 'private 목표 canary' },
    { kind: 'status', status: 'paused' },
    { kind: 'clear' }
  ] as const
  for (const change of changes) {
    const fields = { change }
    const request = { envelope: envelope('agentSession.threadGoal', fields), ...fields }
    vi.mocked(console.log).mockClear()
    await command('thread-goal', request)
    expect(process.exitCode, JSON.stringify(vi.mocked(console.log).mock.calls)).toBeUndefined()
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private 목표 canary')
    await command('thread-goal', request)
    expect(process.exitCode).toBeUndefined()
  }
  expect(changeGoal.mock.calls.map(([args]) => args.change)).toEqual(changes)
  const page = await hostTestState().host.history({
    sessionId: HOST_TEST_SESSION,
    direction: 'tail'
  })
  expect(
    page.ok &&
      page.page.items
        .filter((item) => item.body.kind === 'message' && item.body.sentAs === 'goal')
        .map((item) => item.body)
  ).toEqual([
    {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: 'private 목표 canary' }],
      sentAs: 'goal'
    }
  ])
})
