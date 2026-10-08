import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_BRANCH_RENAME_FAILURE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-branch-rename-failure',
    keys: ['worktree branch-rename-failure'],
    load: async () =>
      (await import('./handlers/workspace-branch-rename-failure.js'))
        .WORKSPACE_BRANCH_RENAME_FAILURE_HANDLERS
  }
]
