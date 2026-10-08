import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_LOG_TAIL_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-log-tail',
    keys: [
      'file log-tail-read',
      'file log-tail-start',
      'file log-tail-status',
      'file log-tail-stop'
    ],
    load: async () => (await import('./handlers/workspace-log-tail.js')).WORKSPACE_LOG_TAIL_HANDLERS
  }
]
