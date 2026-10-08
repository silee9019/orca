import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_OVERLAY_FOCUS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'owning-group-focus'],
    summary: 'Focus the exact mounted browser overlay owning group',
    usage:
      'orca browser owning-group-focus --viewer host --worktree <workspace> --workspace <browser-tab> --group <group> --execution-host <host> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'worktree', 'workspace', 'group', 'execution-host'],
    notes: [
      'Uses the visible overlay callback and verifies its group store. Does not certify native or webview focus. Unavailable, changed and old-peer owners fail explicitly.'
    ]
  }
]
