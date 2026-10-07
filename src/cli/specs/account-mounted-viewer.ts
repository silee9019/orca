import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ACCOUNT_MOUNTED_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account-view', 'mounted'],
    summary: 'Apply a typed draft or dialog action to a mounted desktop account form',
    usage: 'orca account-view mounted --viewer desktop --input-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'input-file'],
    notes: [
      'Reads a strict account form action JSON object from a file or stdin. Draft values are never accepted as command arguments or printed. Unmounted or ambiguous forms fail explicitly.'
    ]
  }
]
