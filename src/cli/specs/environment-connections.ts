import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const ENVIRONMENT_CONNECTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['environment', 'connection', 'browser-placement'],
    summary:
      'Prepare browser placement through the selected paired server with capability and pairing checks',
    usage:
      'orca environment connection browser-placement --server <selector> [--preference auto|server] [--pairing-revision <revision>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'server', 'preference', 'pairing-revision']
  },
  {
    path: ['environment', 'connection', 'probe'],
    summary:
      'Probe the saved server through its original transport without changing manual disconnect policy',
    usage: 'orca environment connection probe --server <selector> [--observe-only] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'server', 'observe-only']
  },
  {
    path: ['environment', 'connection', 'list'],
    summary: 'List runtime connections owned by the answering host',
    usage: 'orca environment connection list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'connection', 'show'],
    summary: 'Resolve one saved runtime connection',
    usage: 'orca environment connection show --server <id-or-name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'server']
  },
  {
    path: ['environment', 'connection', 'add'],
    summary: 'Verify a pairing link before saving a runtime connection',
    usage:
      'orca environment connection add --name <name> --input-stdin [--allow-loopback] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'input-file', 'input-stdin', 'allow-loopback']
  },
  {
    path: ['environment', 'connection', 'connect'],
    summary: 'Reconnect one saved runtime connection and return host status',
    usage: 'orca environment connection connect --server <id-or-name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'server']
  },
  {
    path: ['environment', 'connection', 'disconnect'],
    summary: 'Disconnect one saved runtime connection without stopping remote work',
    usage: 'orca environment connection disconnect --server <id-or-name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'server']
  },
  {
    path: ['environment', 'connection', 'status'],
    summary: 'Read the status owner snapshots of saved runtime connections',
    usage: 'orca environment connection status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'connection', 'rm'],
    destructive: true,
    summary: 'Remove one exact confirmed runtime connection',
    usage:
      'orca environment connection rm --server <id-or-name> --confirm-target <same-id-or-name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'server', 'confirm-target']
  }
]
