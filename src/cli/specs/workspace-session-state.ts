import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_SESSION_STATE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'session-state'],
    summary: 'Read the current workspace session state partition on the addressed host',
    usage: 'orca terminal session-state --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Accepts {hostId?:string|null}; omitted or null selects the addressed host’s local partition. SSH and paired runtime IDs select stored partitions, not new connections. Reads current Store state, which may include pending writes. Unknown partitions return the canonical empty session. Output can contain private titles, paths and workspace layout; it does not establish that a terminal or host is live.'
    ]
  },
  {
    path: ['terminal', 'flush-session'],
    summary: 'Wait for pending profile state writes on the addressed host to become durable',
    usage: 'orca terminal flush-session --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires {confirm:true}. Flushes all pending profile state on the addressed host, including session partitions. Returns success only after the canonical SQLite durability barrier; frozen or failed writes are errors.'
    ]
  }
]
