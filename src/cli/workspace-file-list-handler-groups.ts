import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_FILE_LIST_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-file-list',
    keys: [
      'file desktop-list-start',
      'file desktop-list-status',
      'file desktop-list-cancel',
      'file desktop-list-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-file-list.js')).WORKSPACE_FILE_LIST_HANDLERS
  }
]
