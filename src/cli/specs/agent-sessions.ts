import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { STRUCTURED_AGENT_SESSION_COMMAND_SPECS } from './structured-agent-sessions'

const REQUEST_FLAGS = [...GLOBAL_FLAGS, 'request-file']

const AGENT_LAUNCH_NOTES = [
  'Use the existing terminal.createAgentSession or terminal.ensureAgentSession request. Private prompts stay in a local file or piped stdin; resume support depends on the selected provider.'
]

const TERMINAL_REQUEST_NOTES = [
  'Use the named terminal or session.tabs RPC request shape. The execution host resolves the workspace and enforces tab visibility; folder workspaces are supported.'
]

const HISTORY_REQUEST_NOTES = [
  'Reads a local UTF-8 JSON request file, or - for piped stdin. Transcript paths belong to the addressed execution host; no local-host fallback runs.',
  'Search transcript text with orca search. A resume-plan prepares a launch; it does not start a provider.'
]

export const AGENT_SESSION_COMMAND_SPECS: CommandSpec[] = [
  ...STRUCTURED_AGENT_SESSION_COMMAND_SPECS,
  {
    path: ['terminal', 'workspace-hosts'],
    summary: 'List execution host IDs with persisted workspace session partitions',
    usage: 'orca terminal workspace-hosts [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads the addressed host’s persistence store, including folder-only SSH hosts. These IDs do not prove a host is connected.'
    ]
  },
  {
    path: ['terminal', 'side-effects'],
    summary: 'Read the terminal’s current title without replaying past notifications',
    usage: 'orca terminal side-effects --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: ['Requires {terminal}. Reads host-owned title state; an exited target fails.']
  },
  {
    path: ['terminal', 'fit-overrides'],
    summary: 'Read the execution host’s current terminal fit overrides',
    usage: 'orca terminal fit-overrides [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['Reads current host state without resizing a terminal.']
  },
  {
    path: ['terminal', 'drivers'],
    summary: 'Read who currently owns terminal input and resize control',
    usage: 'orca terminal drivers [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['Reads current host state without claiming or releasing control.']
  },
  {
    path: ['agent', 'awake', 'status'],
    summary: 'Read the execution host’s current agent awake status',
    usage: 'orca agent awake status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads the existing service without changing its mode. A host without the service fails explicitly.'
    ]
  },
  {
    path: ['agent', 'hooks', 'workspace-check'],
    summary: 'Inspect repository hooks on their execution host',
    usage: 'orca agent hooks workspace-check --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires {repo}. Inspection errors fail; a folder workspace has no Git repository hooks.'
    ]
  },
  {
    path: ['agent', 'hooks', 'setup-imports'],
    summary: 'Inspect setup scripts that the execution host can import',
    usage: 'orca agent hooks setup-imports --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: ['Requires {repo}. Reads existing configurations; no script is executed.']
  },
  {
    path: ['agent', 'hooks', 'issue-read'],
    summary: 'Read the private and shared issue commands on their execution host',
    usage: 'orca agent hooks issue-read --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: ['Requires {repo}. The output contains the requested command text.']
  },
  {
    path: ['agent', 'hooks', 'issue-write'],
    destructive: true,
    summary: 'Save a private issue command override without executing it',
    usage: 'orca agent hooks issue-write --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires {repo, content}. Use a client-local UTF-8 file or piped stdin for private content; blank content restores the shared command. Git repository workspaces only.'
    ]
  },
  {
    path: ['terminal', 'daemon', 'list'],
    summary: 'List daemon-owned sessions and preserve unreachable daemon observations',
    usage: 'orca terminal daemon list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The addressed runtime lists its own native and WSL daemon adapters; SSH relay processes are outside this inventory.'
    ]
  },
  {
    path: ['terminal', 'daemon', 'stop'],
    destructive: true,
    summary: 'End exactly one observed daemon session incarnation',
    usage: 'orca terminal daemon stop --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires sessionId, incarnationId, protocolVersion and confirm:true from a fresh daemon list. Daemons without negotiated incarnation checks are refused.'
    ]
  },
  {
    path: ['terminal', 'daemon', 'stop-many'],
    destructive: true,
    summary: 'End an explicit snapshot of daemon session incarnations',
    usage: 'orca terminal daemon stop-many --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires targets containing 1–256 confirmed exact-session requests. Newly created sessions are never selected implicitly; a partial or unverifiable result exits unsuccessfully.'
    ]
  },
  {
    path: ['agent', 'terminal', 'create'],
    summary: 'Launch an agent through the host-owned idempotent session service',
    usage: 'orca agent terminal create --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: AGENT_LAUNCH_NOTES
  },
  {
    path: ['agent', 'terminal', 'ensure'],
    summary: 'Resume a provider session or a sleeping checkpoint through its host',
    usage: 'orca agent terminal ensure --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: AGENT_LAUNCH_NOTES
  },
  {
    path: ['agent', 'status', 'list'],
    summary: 'Read canonical agent status metadata without prompts or launch credentials',
    usage: 'orca agent status list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'status', 'migration'],
    summary: 'Read panes whose legacy identity could not be migrated',
    usage: 'orca agent status migration [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'status', 'dismiss'],
    summary: 'Dismiss one observed status row without ending its process',
    usage: 'orca agent status dismiss --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires paneKey, receivedAt and stateStartedAt from agent status list. A changed row is refused; this action never infers process exit.'
    ]
  },
  {
    path: ['terminal', 'clear'],
    summary: 'Clear retained terminal output',
    usage: 'orca terminal clear --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'reset-input'],
    summary: 'Reset terminal input modes',
    usage: 'orca terminal reset-input --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'inspect-process'],
    summary: 'Read host process evidence for one terminal incarnation',
    usage: 'orca terminal inspect-process --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'identity'],
    summary: 'Resolve a terminal or structured worker identity without writing input',
    usage: 'orca terminal identity --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'agent-status'],
    summary: 'Read the canonical host status for one terminal',
    usage: 'orca terminal agent-status --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'restore-fit'],
    summary: 'Restore desktop dimensions for one terminal',
    usage: 'orca terminal restore-fit --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'display-mode'],
    summary: 'Read terminal display mode and phone-fit status',
    usage: 'orca terminal display-mode --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'set-display-mode'],
    summary: 'Set terminal display mode through the existing host driver',
    usage: 'orca terminal set-display-mode --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'tabs'],
    summary: 'Read workspace terminal and chat tabs',
    usage: 'orca terminal tabs --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'move-tab'],
    summary: 'Reorder, move or split a tab group',
    usage: 'orca terminal move-tab --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'set-tab'],
    summary: 'Set a tab color, pin or view mode',
    usage: 'orca terminal set-tab --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['terminal', 'set-layout'],
    summary: 'Set the pane layout of one tab',
    usage: 'orca terminal set-layout --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: TERMINAL_REQUEST_NOTES
  },
  {
    path: ['agent', 'history', 'delete'],
    aliases: [['agent', 'history', 'rm']],
    destructive: true,
    summary: 'Trash one host-local transcript and its provider companions',
    usage: 'orca agent history delete --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: HISTORY_REQUEST_NOTES
  },
  {
    path: ['agent', 'history', 'subagents'],
    destructive: false,
    summary: 'List Claude or OMP subagent transcripts under their known roots',
    usage: 'orca agent history subagents --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: HISTORY_REQUEST_NOTES
  },
  {
    path: ['agent', 'history', 'list'],
    destructive: false,
    summary: 'List provider transcripts on the execution host',
    usage: 'orca agent history list --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: HISTORY_REQUEST_NOTES
  },
  {
    path: ['agent', 'history', 'titles'],
    destructive: false,
    summary: 'Resolve provider transcript titles',
    usage: 'orca agent history titles --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: HISTORY_REQUEST_NOTES
  },
  {
    path: ['agent', 'history', 'resume-plan'],
    destructive: false,
    summary: 'Prepare an existing provider transcript for resuming',
    usage: 'orca agent history resume-plan --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: HISTORY_REQUEST_NOTES
  },
  {
    path: ['agent', 'history', 'read'],
    destructive: false,
    summary: 'Read a bounded page of an existing provider transcript',
    usage: 'orca agent history read --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: HISTORY_REQUEST_NOTES
  }
]
