import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const WORKSPACE_SESSION_WRITE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'patch-session'],
    summary: 'Patch selected session fields after comparing the complete observed session',
    usage: 'orca terminal patch-session --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict JSON requires {hostId,expected,patch,confirm:true}. The full expected snapshot and the resulting merged state must pass the existing schema without repair or removal. Stale snapshots are refused inside the durable mutation queue.',
      'Calls the canonical partial setter with only supplied fields; its topology preservation rules remain active. Receipt and failure semantics match set-session, including normalized:true and indeterminate persistence. No session content is echoed and no rendered viewer application is claimed.'
    ]
  },
  {
    path: ['terminal', 'set-session'],
    summary:
      'Replace an explicitly selected workspace session after comparing its entire observed state',
    usage: 'orca terminal set-session --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict JSON requires {hostId,expected,next,confirm:true}. Read expected from terminal session-state on the same selected execution host. Both full snapshots must pass the existing schema without field removal or repair. Invalid, incomplete or future unknown fields are refused before writing.',
      'Compares expected inside the canonical durable mutation queue. A stale preimage is refused without freezing future writes. The existing Store preserves runtime-owned fields, bindings and tombstones; normalized:true reports that its resulting state differs from next. Read session-state for the applied state.',
      'Returns applied:true and durable:true only after the profile write succeeds; output excludes session contents. Failures do not claim success; an indeterminate commit can leave applied memory and requires session-state read-back. Cancelling a wait does not undo a write already started. This updates stored session state and does not establish rendered viewer application.'
    ]
  }
]
