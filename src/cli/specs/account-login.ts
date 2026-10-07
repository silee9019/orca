import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ACCOUNT_LOGIN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account', 'login', 'start'],
    summary: 'Start managed account sign-in or reauthentication on this host',
    usage: 'orca account login start --agent claude|codex [--account <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'account'],
    notes: [
      'The runtime starts the existing browser sign-in flow. Use status to observe completion or cancel to stop waiting. Human authorization remains required.'
    ]
  },
  {
    path: ['account', 'login', 'status'],
    summary: 'Show sign-in progress and whether Codex is waiting for browser authorization',
    usage: 'orca account login status --agent claude|codex [--url-file <new-path>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'url-file'],
    notes: [
      'Codex --url-file writes the pending authorization URL to a new private file; stdout contains only progress.'
    ]
  },
  {
    path: ['account', 'login', 'cancel'],
    summary: 'Cancel the pending managed account sign-in on this host',
    usage: 'orca account login cancel --agent claude|codex [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent']
  }
]
