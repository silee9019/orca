import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { agentSessionCliCapabilities } from '../../src/cli/agent-session-capabilities'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { dispatcher } from '../../src/main/runtime/rpc/methods/structured-agent-session-rpc.test-fixture'
import { setStructuredAgentSessionHost } from '../../src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import {
  createQueuedMessageTestRig,
  type QueuedMessageTestRig
} from '../../src/main/native-chat/agent-session-wire/structured-agent-session-queued-message-rig.test-fixture'
import {
  HOST_TEST_SESSION,
  hostTestMessage,
  hostTestOperationId
} from '../../src/main/native-chat/agent-session-wire/structured-agent-session-host-test-data'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = state.call
  }
  return { RuntimeClient, ...errors }
})
let rig: QueuedMessageTestRig
beforeEach(async () => {
  rig = await createQueuedMessageTestRig()
  setStructuredAgentSessionHost(rig.host)
  const rpc = dispatcher()
  state.call.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch(
      { id: 'queue-fixture', authToken: 'fixture', method, params },
      {
        clientId: 'client-1',
        clientKind: 'runtime',
        clientCapabilities: [...agentSessionCliCapabilities(method)]
      }
    )
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
  await rig.workingSend()
})
afterEach(async () => {
  setStructuredAgentSessionHost(null)
  await rig.dispose()
  vi.restoreAllMocks()
  process.exitCode = undefined
})
async function command(action: string, fields: Record<string, unknown>, method: string) {
  const request = {
    envelope: rig.envelope(fields, method, hostTestOperationId()),
    ...fields
  }
  const file = join(rig.root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  await main(['agent', 'session', action, '--request-file', file, '--json'], rig.root)
  const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  expect(process.exitCode, String(output)).toBeUndefined()
  if (typeof output !== 'string') {
    throw new Error('Missing CLI JSON')
  }
  return JSON.parse(output).result
}
async function queue(text: string): Promise<string> {
  const result = await command(
    'send',
    {
      body: hostTestMessage(text),
      delivery: 'queue-if-active'
    },
    'agentSession.send'
  )
  return result.value.queued.messageId
}
it('withdraws and sends queued drafts once through the public CLI and host journal', async () => {
  const deletedId = await queue('private deleted draft')
  await command('queued-delete', { messageId: deletedId }, 'agentSession.queuedMessageDelete')
  await command('queued-delete', { messageId: deletedId }, 'agentSession.queuedMessageDelete')
  expect(await rig.drafts()).toHaveLength(0)
  expect(await rig.handoff(deletedId)).toBeUndefined()
  const sentId = await queue('private sent draft')
  const first = await command(
    'queued-send',
    { messageId: sentId },
    'agentSession.queuedMessageSend'
  )
  const second = await command(
    'queued-send',
    { messageId: sentId },
    'agentSession.queuedMessageSend'
  )
  expect(second.value.clientMessageId).toBe(first.value.clientMessageId)
  expect(
    (await rig.host.journalSnapshot(HOST_TEST_SESSION)).submissions.filter(
      (entry) => entry.queuedMessageId === sentId
    )
  ).toHaveLength(1)
  await vi.waitFor(() => expect(rig.dispatch).toHaveBeenCalledTimes(2))
})
it('resumes a stopped queue once and reads back the canonical pause state', async () => {
  await queue('paused draft')
  await command('cancel', {}, 'agentSession.cancel')
  expect(await rig.queuePause()).toEqual({ reason: 'stopped' })
  const first = await command('queued-resume', {}, 'agentSession.queuedMessagesResume')
  const second = await command('queued-resume', {}, 'agentSession.queuedMessagesResume')
  expect(first.value.resumed).toBe(true)
  expect(second.value.resumed).toBe(false)
  expect(await rig.queuePause()).toBeNull()
})
