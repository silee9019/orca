import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_CLEANUP_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-worktree-forget',
    keys: ['worktree forget-desktop'],
    load: async () =>
      (await import('./handlers/workspace-worktree-forget.js')).WORKSPACE_WORKTREE_FORGET_HANDLERS
  },
  {
    name: 'workspace-cleanup-scan',
    keys: [
      'workspace-cleanup scan-start',
      'workspace-cleanup scan-status',
      'workspace-cleanup scan-cancel',
      'workspace-cleanup scan-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-cleanup-scan.js')).WORKSPACE_CLEANUP_SCAN_HANDLERS
  },
  {
    name: 'workspace-cleanup-dismissals',
    keys: ['workspace-cleanup dismiss', 'workspace-cleanup clear-dismissals'],
    load: async () =>
      (await import('./handlers/workspace-cleanup-dismissals.js'))
        .WORKSPACE_CLEANUP_DISMISSAL_HANDLERS
  }
]
