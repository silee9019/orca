import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const TERMINAL_STARTUP_RESTORATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'prepare-startup'],
    summary: 'Await host startup barriers and prepare persisted structured sessions',
    usage: 'orca terminal prepare-startup --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Request JSON requires confirm:true. Uses the addressed main-process runtime’s existing preparation service after its startup services and managed WSL CLI barriers. A missing or different owner is an error, never another profile fallback.',
      'The service may initialize its persisted structured-session host, refresh PTY records and reconcile restart leases. Its existing refusal policy is preserved. preparationCompleted acknowledges this preparation call, not successful recovery of every session.',
      'Does not perform the separate legacy-worker renderer recovery or acknowledge visible tabs. Inspect individual session state before deciding whether a session is usable.'
    ]
  }
]
