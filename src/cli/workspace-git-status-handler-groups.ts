import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_GIT_STATUS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-git-status',
    keys: [
      'git desktop-status-start',
      'git desktop-status-status',
      'git desktop-status-cancel',
      'git desktop-status-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-git-status.js')).WORKSPACE_GIT_STATUS_HANDLERS
  }
]
