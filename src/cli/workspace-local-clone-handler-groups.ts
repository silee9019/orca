import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_LOCAL_CLONE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-local-clone',
    keys: [
      'repo clone-desktop-local-start',
      'repo clone-desktop-local-status',
      'repo clone-desktop-local-cancel',
      'repo clone-desktop-local-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-local-clone.js')).WORKSPACE_LOCAL_CLONE_HANDLERS
  }
]
