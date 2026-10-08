import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_EXIT_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-exit'],
    summary: 'Observe one pinned terminal exit notification with canonical host evidence',
    usage: 'orca terminal watch-exit --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId and watchMs. Ordered NDJSON emits future raw code, optional canonical cause and live/unverifiable/exited verdict, then closes. No historical exit is replayed.',
      'Reuses the host exit subscription and metadata. SSH contact loss remains unverifiable; a negative code or stream closure is not proof of process death. Does not kill, retry, reveal a renderer or claim viewer teardown. Old hosts and replacement incarnations are refused.'
    ]
  }
]
