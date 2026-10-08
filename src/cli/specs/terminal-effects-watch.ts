import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const TERMINAL_EFFECTS_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-effects'],
    summary: 'Observe canonical side-effect facts for one pinned terminal incarnation',
    usage: 'orca terminal watch-effects --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId, includeContent:true and watchMs. Output may contain titles, prompts, tool input and assistant text. Treat stdout as private.',
      'Ordered NDJSON preserves host batch sequence, attribution and replay markers. Uses the existing parser and per-reader title gate, without historical replay or a status producer. Facts and stream closure are observations, not process completion or liveness verdicts. Replacements and old hosts are refused; this does not prove viewer policy or notifications ran.'
    ]
  }
]
