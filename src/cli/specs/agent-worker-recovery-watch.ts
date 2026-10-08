import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AGENT_WORKER_RECOVERY_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'status', 'watch-recovery'],
    summary: 'Observe scoped canonical legacy worker terminal recovery results',
    usage: 'orca agent status watch-recovery --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires paneKeys (1..128 unique stable keys) and watchMs. Ordered NDJSON contains future adopted, exited and rolled_back host decisions; past results are not replayed.',
      'This observer does not start recovery, adopt a terminal, kill a process or reveal a renderer. Uses the selected local or paired runtime and preserves the existing UI notifier. A surface rollback does not imply exit; host recovery results do not prove the viewer applied them. Old hosts are refused.'
    ]
  }
]
