import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const CARD_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'card', 'get'],
    aliases: [['ui', 'card', 'show']],
    summary: 'Read card preferences and rendered host viewer cards',
    usage: 'orca ui card get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['ui', 'card', 'mode'],
    summary: 'Apply a workspace card preset',
    usage: 'orca ui card mode --viewer host --mode <Default|Compact> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'mode'],
    notes: [
      'Saves the existing layout and property preset together. Applied confirms rendered card configuration. New card style keeps its own density. Persisted confirms host state readback, not disk flush.'
    ]
  },
  {
    path: ['ui', 'card', 'activity'],
    summary: 'Set workspace card agent activity display',
    usage: 'orca ui card activity --viewer host --mode <compact|full> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'mode'],
    notes: [
      'Available for legacy card style, matching the existing menu. Rendered configuration does not imply an agent row exists. Hidden or absent cards do not count as applied.'
    ]
  }
]
