import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ACCOUNT_INSPECTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account-inspect', 'cursor-status'],
    summary: 'Read Cursor sign-in status without credentials',
    usage: 'orca account-inspect cursor-status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['account-inspect', 'grok-status'],
    summary: 'Read Grok sign-in status without credentials',
    usage: 'orca account-inspect grok-status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['account-inspect', 'codex-sync-status'],
    summary: 'Read selected Codex home configuration sync health',
    usage: 'orca account-inspect codex-sync-status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['account-inspect', 'codex-stale-panes'],
    summary: 'Compare exact pane launch accounts against their own runtime selections',
    usage: 'orca account-inspect codex-stale-panes --pty-ids <id,...> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'pty-ids']
  },
  {
    path: ['account-inspect', 'codex-recorded-lanes'],
    summary: 'Read original runtime lanes for exact Codex panes',
    usage: 'orca account-inspect codex-recorded-lanes --pty-ids <id,...> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'pty-ids']
  },
  {
    path: ['account-inspect', 'codex-forget-panes'],
    destructive: true,
    summary: 'Forget account restart hints for exact Codex panes',
    usage: 'orca account-inspect codex-forget-panes --pty-ids <id,...> --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'pty-ids', 'confirm']
  }
]
