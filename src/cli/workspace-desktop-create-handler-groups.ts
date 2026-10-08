import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_DESKTOP_CREATE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-desktop-create',
    keys: ['worktree create-desktop'],
    load: async () =>
      (await import('./handlers/workspace-desktop-create.js')).WORKSPACE_DESKTOP_CREATE_HANDLERS
  }
]
