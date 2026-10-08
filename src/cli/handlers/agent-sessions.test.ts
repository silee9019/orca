import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { AGENT_SESSION_HANDLERS } from './agent-sessions'
import { AGENT_SESSION_COMMAND_SPECS } from '../specs/agent-sessions'
import { parseArgs, validateCommandAndFlags } from '../args'

let directory: string
const sessionId = 'as_fixture'
const envelope = {
  sessionId,
  clientOperationId: 'operation-1',
  expectedRuntimeFence: 1,
  payloadFingerprint: 'a'.repeat(64)
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-agent-sessions-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
})

async function run(command: string, flags: Map<string, string | boolean>) {
  const client = new RuntimeClient(directory)
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: command === 'agent history delete' ? { outcome: 'deleted' } : { accepted: true },
    _meta: { runtimeId: 'fixture-host' }
  })
  const handler = AGENT_SESSION_HANDLERS[command]
  if (!handler) {
    throw new Error(`Missing handler: ${command}`)
  }
  await handler({ client, flags, cwd: directory, json: true })
  return call
}

describe('agent session CLI', () => {
  it('exposes each named handler through its spec', () => {
    expect(AGENT_SESSION_COMMAND_SPECS.map((spec) => spec.path.join(' ')).sort()).toEqual(
      Object.keys(AGENT_SESSION_HANDLERS).sort()
    )
    for (const spec of AGENT_SESSION_COMMAND_SPECS) {
      const parsed = parseArgs([...spec.path, '--json'], [], AGENT_SESSION_COMMAND_SPECS)
      expect(() => validateCommandAndFlags(AGENT_SESSION_COMMAND_SPECS, parsed)).not.toThrow()
    }
  })
  it('reads a bounded page of conversation history on the addressed host', async () => {
    const call = await run(
      'agent session history',
      new Map([
        ['session', sessionId],
        ['direction', 'before'],
        ['limit', '20']
      ])
    )
    expect(call).toHaveBeenCalledWith('agentSession.history', {
      sessionId,
      direction: 'before',
      limit: 20
    })
  })
  it('preserves operation identity and private UTF-8 message content from a local request file', async () => {
    const request = {
      envelope,
      body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: '비밀 canary' }] }
    }
    await writeFile(join(directory, 'request.json'), JSON.stringify(request))
    const call = await run('agent session send', new Map([['request-file', 'request.json']]))
    expect(call).toHaveBeenCalledWith('agentSession.send', request)
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('비밀 canary')
  })
  it('rejects unknown request fields before contacting a host without echoing values', async () => {
    await writeFile(
      join(directory, 'request.json'),
      JSON.stringify({ envelope, secret: '비밀 canary' })
    )
    await expect(
      run('agent session cancel', new Map([['request-file', 'request.json']]))
    ).rejects.toThrow('Invalid agent session request')
  })
  it('propagates a host refusal as failure instead of printing success', async () => {
    await writeFile(join(directory, 'request.json'), JSON.stringify({ envelope }))
    const client = new RuntimeClient(directory)
    vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { ok: false, refusal: { code: 'agent_session_conflict', message: 'Owner unproven' } },
      _meta: { runtimeId: 'fixture-host' }
    })
    const handler = AGENT_SESSION_HANDLERS['agent session cancel']
    if (!handler) {
      throw new Error('Missing cancel handler')
    }
    await expect(
      handler({
        client,
        flags: new Map([['request-file', 'request.json']]),
        cwd: directory,
        json: true
      })
    ).rejects.toMatchObject({ code: 'agent_session_conflict' })
    expect(console.log).not.toHaveBeenCalled()
  })
  it('rejects a malformed cursor without returning an empty history', async () => {
    await expect(
      run(
        'agent session history',
        new Map([
          ['session', sessionId],
          ['cursor', '{bad-canary']
        ])
      )
    ).rejects.toThrow('Invalid --cursor')
  })
})

it.each([
  [
    'agent status dismiss',
    'agentStatus.dismiss',
    {
      paneKey: 'tab-fixture:11111111-1111-4111-8111-111111111111',
      receivedAt: 1000,
      stateStartedAt: 900
    }
  ],
  [
    'agent terminal create',
    'terminal.createAgentSession',
    {
      clientOperationId: '1800000000000-00000000000000000000000000000001',
      worktree: 'folder:fixture',
      agent: 'codex',
      prompt: '비밀 prompt'
    }
  ],
  [
    'agent terminal ensure',
    'terminal.ensureAgentSession',
    {
      kind: 'explicit',
      worktree: 'folder:fixture',
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'provider-1' }
    }
  ],
  [
    'agent history delete',
    'aiVault.deleteSession',
    { agent: 'claude', filePath: '/host/transcript.jsonl' }
  ],
  [
    'agent history subagents',
    'aiVault.listSubagentSessions',
    { agent: 'omp', parentFilePath: '/host/parent.jsonl' }
  ],
  ['terminal clear', 'terminal.clearBuffer', { terminal: 'term_fixture' }],
  ['terminal reset-input', 'terminal.resetInputModes', { terminal: 'term_fixture' }],
  [
    'terminal inspect-process',
    'terminal.inspectProcess',
    { terminal: 'term_fixture', expectedIncarnationId: 'incarnation-1', scanChildProcesses: true }
  ],
  ['terminal identity', 'terminal.resolveIdentity', { terminal: 'term_fixture' }],
  ['terminal agent-status', 'terminal.agentStatus', { terminal: 'term_fixture' }],
  ['terminal restore-fit', 'terminal.restoreFit', { terminal: 'term_fixture' }],
  ['terminal display-mode', 'terminal.getDisplayMode', { terminal: 'term_fixture' }],
  [
    'terminal set-display-mode',
    'terminal.setDisplayMode',
    { terminal: 'term_fixture', mode: 'desktop' }
  ],
  ['terminal tabs', 'session.tabs.list', { worktree: 'folder:fixture' }],
  [
    'terminal move-tab',
    'session.tabs.move',
    {
      worktree: 'folder:fixture',
      tabId: 'tab-1',
      targetGroupId: 'group-1',
      kind: 'move-to-group',
      index: 0
    }
  ],
  [
    'terminal set-tab',
    'session.tabs.setTabProps',
    { worktree: 'folder:fixture', tabId: 'tab-1', color: null, isPinned: true, viewMode: 'chat' }
  ],
  [
    'terminal set-layout',
    'session.tabs.updatePaneLayout',
    {
      worktree: 'folder:fixture',
      tabId: 'tab-1',
      root: { type: 'leaf', leafId: 'leaf-1' },
      expandedLeafId: null
    }
  ],
  ['agent session cancel', 'agentSession.cancel', { envelope }],
  [
    'agent session respond-approval',
    'agentSession.respondToApproval',
    { envelope, itemId: 'prompt-1', expectedRevision: 1, optionId: 'allow' }
  ],
  [
    'agent session respond-question',
    'agentSession.respondToQuestion',
    {
      envelope,
      itemId: 'prompt-1',
      expectedRevision: 1,
      answers: [{ questionId: 'q1', optionIds: [], other: '답변' }]
    }
  ],
  [
    'agent session set-option',
    'agentSession.setOption',
    { envelope, key: 'model', value: 'fixture-model' }
  ],
  [
    'agent session conversation-command',
    'agentSession.conversationCommand',
    { envelope, command: 'compact' }
  ],
  [
    'agent session rewind',
    'agentSession.rewind',
    { envelope, itemId: 'item-1', expectedEpoch: 'epoch-1' }
  ],
  [
    'agent session thread-goal',
    'agentSession.threadGoal',
    { envelope, change: { kind: 'status', status: 'paused' } }
  ],
  [
    'agent session queued-send',
    'agentSession.queuedMessageSend',
    { envelope, messageId: 'queued-1' }
  ],
  [
    'agent session queued-delete',
    'agentSession.queuedMessageDelete',
    { envelope, messageId: 'queued-1' }
  ],
  ['agent session queued-resume', 'agentSession.queuedMessagesResume', { envelope }],
  [
    'agent session model-catalog',
    'agentSession.modelCatalog',
    { agent: 'codex', worktree: 'folder:fixture' }
  ],
  [
    'agent session create',
    'agentSession.create',
    {
      envelope: { ...envelope, expectedRuntimeFence: null },
      worktree: 'folder:fixture',
      agent: 'codex'
    }
  ],
  [
    'agent session restart-dismiss',
    'agentSession.restartResumableDismiss',
    { sessionIds: [sessionId] }
  ],
  ['agent session restart-continue', 'agentSession.restartContinue', { sessionIds: [sessionId] }],
  ['agent history list', 'aiVault.listSessions', { limit: 20, scopePaths: ['/host/folder'] }],
  [
    'agent history titles',
    'aiVault.resolveSessionTitles',
    { requests: [{ agent: 'codex', sessionId: 'provider-1' }] }
  ],
  [
    'agent history resume-plan',
    'aiVault.prepareSessionResume',
    { agent: 'claude', filePath: '/host/transcript.jsonl', codexHome: null }
  ],
  [
    'agent history read',
    'nativeChat.readSession',
    { agent: 'codex', sessionId: 'provider-1', limit: 20 }
  ]
])('%s reaches only its named existing RPC', async (command, method, request) => {
  await writeFile(join(directory, 'request.json'), JSON.stringify(request))
  const call = await run(command, new Map([['request-file', 'request.json']]))
  expect(call).toHaveBeenCalledExactlyOnceWith(method, request)
})

it.each([
  { envelope, taskId: 'task-without-scope' },
  { envelope, scope: 'background-tasks' },
  { envelope: { ...envelope, payloadFingerprint: 'invalid-private-canary' } }
])('rejects invalid stop targets and envelopes before the RPC boundary', async (request) => {
  await writeFile(join(directory, 'request.json'), JSON.stringify(request))
  const client = new RuntimeClient(directory)
  const call = vi.spyOn(client, 'call')
  const handler = AGENT_SESSION_HANDLERS['agent session cancel']
  if (!handler) {
    throw new Error('Missing cancel handler')
  }
  await expect(
    handler({
      client,
      flags: new Map([['request-file', 'request.json']]),
      cwd: directory,
      json: true
    })
  ).rejects.toThrow('Invalid agent session request')
  expect(call).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})

it('reports a rejected transcript deletion as a command failure', async () => {
  await writeFile(
    join(directory, 'request.json'),
    JSON.stringify({ agent: 'claude', filePath: '/host/transcript.jsonl' })
  )
  const client = new RuntimeClient(directory)
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { outcome: 'rejected', agent: 'claude', reason: 'path-outside-known-roots' },
    _meta: { runtimeId: 'fixture' }
  })
  const handler = AGENT_SESSION_HANDLERS['agent history delete']
  if (!handler) {
    throw new Error('Missing delete handler')
  }
  await expect(
    handler({
      client,
      flags: new Map([['request-file', 'request.json']]),
      cwd: directory,
      json: true
    })
  ).rejects.toMatchObject({ code: 'ai_vault_delete_rejected' })
  expect(console.log).not.toHaveBeenCalled()
})

it.each([
  ['agent session close', 'agentSession.close'],
  ['agent session reveal', 'agentSession.reveal']
])('%s names a single session', async (command, method) => {
  const call = await run(command, new Map([['session', sessionId]]))
  expect(call).toHaveBeenCalledExactlyOnceWith(method, { sessionId })
})

it.each(['file', 'stdin'] as const)(
  'refuses malformed UTF-8 in a request %s before RPC',
  async (kind) => {
    const prefix = Buffer.from(
      JSON.stringify({
        envelope,
        body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'bad' }] }
      }).replace('bad', '')
    )
    const position = prefix.indexOf('"text":"') + '"text":"'.length
    const malformed = Buffer.concat([
      prefix.subarray(0, position),
      Buffer.from([0xc3, 0x28]),
      prefix.subarray(position)
    ])
    const client = new RuntimeClient(directory)
    const call = vi.spyOn(client, 'call')
    if (kind === 'file') {
      await writeFile(join(directory, 'request.json'), malformed)
    } else {
      vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* () {
        yield malformed
        return undefined
      })
    }
    await expect(
      AGENT_SESSION_HANDLERS['agent session send']({
        client,
        flags: new Map([['request-file', kind === 'file' ? 'request.json' : '-']]),
        cwd: directory,
        json: true
      })
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  }
)
