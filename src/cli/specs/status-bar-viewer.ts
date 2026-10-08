import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const STATUS_BAR_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'status-bar', 'get'],
    aliases: [['ui', 'status-bar', 'show']],
    summary: 'Read host status bar preferences and rendered configuration',
    usage: 'orca ui status-bar get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['ui', 'status-bar', 'toggle'],
    summary: 'Toggle the host status bar',
    usage: 'orca ui status-bar toggle --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['ui', 'status-bar', 'item'],
    summary: 'Set an available status bar indicator',
    usage: 'orca ui status-bar item --viewer host --item <id> --enabled <true|false> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'item', 'enabled'],
    notes: [
      'Uses the existing Appearance checkbox and interaction recording. Repeating an enabled value is a no-op. A configured indicator does not imply a live meter or connection.'
    ]
  },
  {
    path: ['ui', 'status-bar', 'percentage'],
    summary: 'Set usage percentage display',
    usage: 'orca ui status-bar percentage --viewer host --display <used|remaining> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'display'],
    notes: [
      'Also dismisses the existing one-time percentage notice. Applied confirms rendered configuration; providers lists only visible rendered chips. Persisted confirms host state, not disk flush.'
    ]
  }
]
