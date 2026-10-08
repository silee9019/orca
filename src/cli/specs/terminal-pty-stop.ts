import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const TERMINAL_PTY_STOP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'stop-pty'],
    summary: 'Await the existing renderer PTY stop on its execution host',
    usage: 'orca terminal stop-pty --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict JSON requires {terminal,expectedPtyId,expectedIncarnationId,expectedExecutionHostId,keepHistory,confirm:true}. Read these identities on the same selected host. Refuses stale or unknown incarnations before stopping, including after provider startup.',
      'Uses the existing immediate renderer stop path and preserves explicit keepHistory. This stops the PTY without closing its terminal layout. A synthesized exit or detached SSH host returns status:unverifiable and exit 1; only provider exit evidence returns status:exited. Cancelling after shutdown starts does not undo it.'
    ]
  }
]
