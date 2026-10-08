import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const REQUEST_FLAGS = [...GLOBAL_FLAGS, 'request-file']
const SESSION_FLAGS = [...GLOBAL_FLAGS, 'session']

const SESSION_MUTATION_NOTES = [
  'Read the named action request as UTF-8 JSON from a local file, or - for piped stdin; maximum 1 MiB. Never put private message or answer content in argv.',
  'Uses the existing agentSession RPC request shape and host authorization. Mutations retain the supplied operation ID, runtime fence and payload fingerprint; retry the same request after an uncertain result.',
  'Targets one execution host through --environment or --pairing-code; request file paths are client-local, workspace and image paths inside the request belong to that execution host.',
  'An unavailable method on an older host is an error; no terminal or local-host fallback runs.'
]

export const STRUCTURED_AGENT_SESSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'session', 'held'],
    summary: 'Check whether the execution host holds saved structured chats',
    usage: 'orca agent session held [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads the existing host registry, including pending legacy import, without restoring sessions or launching an agent.'
    ]
  },
  {
    path: ['agent', 'session', 'agents'],
    summary: 'List agents registered on the execution host',
    usage: 'orca agent session agents [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'session', 'create-support'],
    summary: 'Check structured chat support for one workspace and agent',
    usage: 'orca agent session create-support --worktree <selector> --agent <id> [--json]',
    allowedFlags: ['help', 'json', 'pairing-code', 'environment', 'worktree', 'agent'],
    notes: ['The execution host resolves the selector; folder workspaces are supported.']
  },
  {
    path: ['agent', 'session', 'history'],
    summary: 'Read a bounded page of structured conversation history',
    usage:
      'orca agent session history --session <id> [--direction tail|before|after] [--cursor <json>] [--limit <n>] [--json]',
    allowedFlags: [
      'help',
      'json',
      'pairing-code',
      'environment',
      'session',
      'direction',
      'cursor',
      'limit'
    ],
    notes: [
      'The cursor is the epoch/sequence object returned by this session on this host. History reads never launch an agent.'
    ]
  },
  {
    path: ['agent', 'session', 'close'],
    summary: 'Close one chat view and provider child while retaining its conversation',
    destructive: true,
    usage: 'orca agent session close --session <id> [--json]',
    allowedFlags: SESSION_FLAGS
  },
  {
    path: ['agent', 'session', 'reveal'],
    summary: 'Republish an existing chat tab from its host-owned record',
    destructive: false,
    usage: 'orca agent session reveal --session <id> [--json]',
    allowedFlags: SESSION_FLAGS
  },
  {
    path: ['agent', 'session', 'options'],
    summary: 'Read the session model, mode and provider options',
    destructive: false,
    usage: 'orca agent session options --session <id> [--json]',
    allowedFlags: SESSION_FLAGS
  },
  {
    path: ['agent', 'session', 'commands'],
    summary: 'Read the commands supported by the session provider',
    destructive: false,
    usage: 'orca agent session commands --session <id> [--json]',
    allowedFlags: SESSION_FLAGS
  },
  {
    path: ['agent', 'session', 'outline'],
    summary: 'Read the conversation message outline',
    destructive: false,
    usage: 'orca agent session outline --session <id> [--json]',
    allowedFlags: SESSION_FLAGS
  },
  {
    path: ['agent', 'session', 'handoff-status'],
    summary: 'Read execution-owner classification without changing ownership',
    destructive: false,
    usage: 'orca agent session handoff-status --session <id> [--json]',
    allowedFlags: SESSION_FLAGS
  },
  {
    path: ['agent', 'session', 'model-catalog'],
    summary: 'Read models for an agent and optional session or workspace',
    destructive: false,
    usage: 'orca agent session model-catalog --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'create'],
    summary: 'Create or resume a structured chat in a git or folder workspace',
    destructive: false,
    usage: 'orca agent session create --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'send'],
    summary: 'Send or queue a user message in a structured chat',
    destructive: false,
    usage: 'orca agent session send --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'cancel'],
    summary: 'Stop the named turn, prompt or background task',
    destructive: true,
    usage: 'orca agent session cancel --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'respond-approval'],
    summary: 'Respond to one provider approval at its observed revision',
    destructive: true,
    usage: 'orca agent session respond-approval --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'respond-question'],
    summary: 'Respond to one provider question at its observed revision',
    destructive: false,
    usage: 'orca agent session respond-question --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'set-option'],
    summary: 'Change a session model or provider option',
    destructive: false,
    usage: 'orca agent session set-option --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'conversation-command'],
    summary: 'Clear or compact the conversation',
    destructive: true,
    usage: 'orca agent session conversation-command --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'rewind'],
    summary: 'Rewind to a named item at its observed journal epoch',
    destructive: true,
    usage: 'orca agent session rewind --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'thread-goal'],
    summary: 'Set, pause, resume or clear the conversation goal',
    destructive: false,
    usage: 'orca agent session thread-goal --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'queued-send'],
    summary: 'Send one host-held queued message',
    destructive: false,
    usage: 'orca agent session queued-send --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'queued-delete'],
    summary: 'Delete one host-held queued message',
    destructive: true,
    usage: 'orca agent session queued-delete --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'queued-resume'],
    summary: 'Resume delivery of host-held queued messages',
    destructive: false,
    usage: 'orca agent session queued-resume --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'restart-dismiss'],
    summary: 'Dismiss selected restart offers, or all visible offers',
    destructive: true,
    usage: 'orca agent session restart-dismiss --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'restart-continue'],
    summary: 'Continue selected restart offers, or all visible offers',
    destructive: false,
    usage: 'orca agent session restart-continue --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: SESSION_MUTATION_NOTES
  },
  {
    path: ['agent', 'session', 'restart-list'],
    summary: 'Read resumable and failed restart offers from the execution host',
    usage: 'orca agent session restart-list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]
