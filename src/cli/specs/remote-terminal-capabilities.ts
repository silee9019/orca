import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const REMOTE_TERMINAL_CAPABILITIES_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'remote-capabilities'],
    summary: 'Read Windows terminal capabilities through one active SSH connection',
    usage: 'orca terminal remote-capabilities --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Requires {connectionId} from the addressed execution host. A null hostPlatform means no platform evidence; false capability fields do not prove absence when contact is unknown. Does not connect, install or probe the CLI machine.'
    ]
  }
]
