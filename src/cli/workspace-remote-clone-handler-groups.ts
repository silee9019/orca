import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_REMOTE_CLONE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-remote-clone',
    keys: [
      'repo clone-desktop-remote-start',
      'repo clone-desktop-remote-status',
      'repo clone-desktop-remote-cancel',
      'repo clone-desktop-remote-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-remote-clone.js')).WORKSPACE_REMOTE_CLONE_HANDLERS
  }
]
