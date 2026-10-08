import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const MOBILE_NETWORK_HUMAN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['mobile', 'network-action', 'complete'],
    summary: 'Record operator completion of the exact manual network action',
    usage: 'orca mobile network-action complete --request <id> --confirm-target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request', 'confirm-target'],
    notes: ['Reports human-confirmed, separately from inspector-verified firewall evidence.']
  },
  {
    path: ['mobile', 'network-action', 'start'],
    summary: 'Describe a manual Windows network action without opening settings',
    usage:
      'orca mobile network-action start --action <repair-firewall|open-network-settings> [--address <address>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'action', 'address'],
    notes: [
      'This starts a tracked human step. It does not run elevation, change firewall rules, open settings, or take desktop focus.',
      'Requests remain available in this runtime session. A host inspection is required before a firewall repair is verified.'
    ]
  },
  {
    path: ['mobile', 'network-action', 'status'],
    summary: 'Read one manual Windows network action',
    usage: 'orca mobile network-action status --request <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request']
  },
  {
    path: ['mobile', 'network-action', 'cancel'],
    summary: 'Cancel one pending manual Windows network action',
    usage: 'orca mobile network-action cancel --request <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request']
  },
  {
    path: ['mobile', 'network-action', 'verify'],
    summary: 'Ask the answering host to verify a manual firewall repair',
    usage: 'orca mobile network-action verify --request <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request']
  }
]
