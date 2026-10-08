import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_DESKTOP_REMOVE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-desktop-remove',
    keys: ['worktree preview-desktop-removal', 'worktree remove-desktop'],
    load: async () =>
      (await import('./handlers/workspace-desktop-remove.js')).WORKSPACE_DESKTOP_REMOVE_HANDLERS
  }
]
