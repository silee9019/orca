import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const MOBILE_CONNECTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['mobile', 'relay', 'watch'],
    summary: 'Observe canonical desktop mobile relay status changes',
    usage: 'orca mobile relay watch [--duration-ms <1..60000>] [--limit <1..1000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'duration-ms', 'limit'],
    notes: [
      'Local authenticated connection only. Uses the existing desktop relay status owner and client-event subscription; cell URLs and credentials are excluded. Ctrl+C releases the subscriber. Older runtimes without relay snapshots fail explicitly.'
    ]
  },
  {
    path: ['mobile', 'network'],
    summary: 'List available pairing network addresses',
    usage: 'orca mobile network [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['mobile', 'status'],
    summary: 'Read the mobile WebSocket listener status',
    usage: 'orca mobile status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['mobile', 'relay'],
    summary: 'Read the mobile relay status',
    usage: 'orca mobile relay [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['mobile', 'devices'],
    summary: 'List mobile devices that actually connected',
    usage: 'orca mobile devices [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['mobile', 'grants'],
    summary: 'List revocable runtime access grants',
    usage: 'orca mobile grants [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['mobile', 'device', 'revoke'],
    destructive: true,
    summary: 'Revoke one exact confirmed mobile device',
    usage: 'orca mobile device revoke --device <id> --confirm-target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'confirm-target']
  },
  {
    path: ['mobile', 'grant', 'revoke'],
    destructive: true,
    summary: 'Revoke one exact confirmed runtime grant',
    usage: 'orca mobile grant revoke --device <id> --confirm-target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'device', 'confirm-target']
  },
  {
    path: ['mobile', 'firewall', 'status'],
    summary: 'Inspect the Windows mobile firewall rules',
    usage: 'orca mobile firewall status [--address <address>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'address']
  },
  {
    path: ['mobile', 'pairing', 'create'],
    summary: 'Create mobile pairing details in a private new file',
    usage:
      'orca mobile pairing create --mode <automatic|local-only> --output-file <new-file> [--address <address>] [--rotate] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'mode', 'output-file', 'address', 'rotate'],
    notes: [
      'Pairing credentials are written only to --output-file with owner-only permissions. Existing files are never overwritten.',
      'Automatic relay pairing requires the host to be signed in. LAN mode does not silently replace relay mode.'
    ]
  },
  {
    path: ['mobile', 'runtime-pairing', 'create'],
    summary: 'Create a runtime access link in a private new file',
    usage:
      'orca mobile runtime-pairing create --reach <this-computer|network> --output-file <new-file> [--address <address>] [--rotate] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'reach', 'output-file', 'address', 'rotate'],
    notes: [
      'Network reach explicitly allows the runtime listener to become reachable off-host. This computer reach preserves loopback-only exposure when the advertised address is loopback.'
    ]
  }
]
