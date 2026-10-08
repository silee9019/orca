import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AGENT_MIGRATION_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'status', 'watch-migration'],
    summary: 'Observe scoped host migration-unsupported PTY entries',
    usage: 'orca agent status watch-migration --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires ptyIds (1..128 unique IDs) and watchMs. Future canonical set and clear entries are ordered NDJSON; past entries are not replayed. Read agent status migration on the same host for a snapshot.',
      'Keeps existing UI and persistence listeners. An entry reports a pane-key migration limitation; neither set nor clear proves process liveness, exit or successful recovery. Uses the selected local or paired host and refuses old hosts.'
    ]
  }
]
