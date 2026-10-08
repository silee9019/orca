import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_SPAWN_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-spawned'],
    summary: 'Observe scoped host PTY lifecycle announcements',
    usage: 'orca terminal watch-spawned --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires executionHostIds (1..128 unique local/ssh host IDs) and watchMs; optional ptyIds (0..128 unique) narrows the selected hosts. Empty ptyIds observes all future PTYs on those explicit hosts. Local is relative to the selected runtime, including paired hosts.',
      'Ordered NDJSON preserves announced incarnation when supplied and awaitsRegistration. This existing signal can mean a reattach, not a newly created process; awaiting registration is not ready-to-write evidence. No historical replay, new cache, process creation or viewer activation. Foreign/proxy host IDs and old runtimes are refused or excluded.'
    ]
  }
]
