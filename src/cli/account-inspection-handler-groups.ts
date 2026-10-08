import type { HandlerGroup } from './handler-group-manifest'

export const ACCOUNT_INSPECTION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'account-inspection',
    keys: [
      'account-inspect cursor-status',
      'account-inspect grok-status',
      'account-inspect codex-sync-status',
      'account-inspect codex-stale-panes',
      'account-inspect codex-recorded-lanes',
      'account-inspect codex-forget-panes'
    ],
    load: async () => (await import('./handlers/account-inspection.js')).ACCOUNT_INSPECTION_HANDLERS
  }
]
