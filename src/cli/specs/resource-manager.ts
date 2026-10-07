import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const RESOURCE_MANAGER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['resource-manager', 'status'],
    summary: 'Read the selected desktop resource manager state and confirmation targets',
    usage: 'orca resource-manager status --viewer desktop [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['resource-manager', 'apply'],
    summary: 'Apply a typed resource manager action and await desktop acknowledgement',
    usage: 'orca resource-manager apply --viewer desktop --request-file <json-path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'request-file']
  }
]
