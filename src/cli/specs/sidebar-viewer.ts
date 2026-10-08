import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const SIDEBAR_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'sidebar', 'get'],
    summary: 'Read the host viewer sidebar layout',
    usage: 'orca ui sidebar get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['ui', 'sidebar', 'toggle'],
    summary: 'Toggle a visible sidebar through the existing app command',
    usage: 'orca ui sidebar toggle --viewer host --side <left|right> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'side']
  },
  {
    path: ['ui', 'panel', 'open'],
    summary: 'Open an available host viewer panel',
    usage:
      'orca ui panel open --viewer host --panel <files|search|source-control|checks|ports> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'panel'],
    notes: [
      'Uses existing view, creation and terminal-search guards. Reports the actual effective panel and loaded content, without native window activation. Unavailable folder or host panels are rejected. Applied confirms rendering; persisted is unknown.'
    ]
  }
]
