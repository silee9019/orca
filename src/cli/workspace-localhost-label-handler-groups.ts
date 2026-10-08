import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_LOCALHOST_LABEL_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-localhost-label',
    keys: ['workspace-ports register-localhost-label'],
    load: async () =>
      (await import('./handlers/workspace-localhost-label.js')).WORKSPACE_LOCALHOST_LABEL_HANDLERS
  }
]
