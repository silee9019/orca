import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_DESKTOP_ADOPT_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-desktop-adopt',
    keys: ['worktree adopt-desktop-provisioned-root'],
    load: async () =>
      (await import('./handlers/workspace-desktop-adopt.js')).WORKSPACE_DESKTOP_ADOPT_HANDLERS
  }
]
