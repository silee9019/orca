import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_REPO_REGISTRATION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-repo-add',
    keys: ['repo add-desktop-local', 'repo add-desktop-remote'],
    load: async () => (await import('./handlers/workspace-repo-add.js')).WORKSPACE_REPO_ADD_HANDLERS
  },
  {
    name: 'workspace-repo-create-remote',
    keys: ['repo create-desktop-remote'],
    load: async () =>
      (await import('./handlers/workspace-repo-create-remote.js'))
        .WORKSPACE_REPO_CREATE_REMOTE_HANDLERS
  }
]
