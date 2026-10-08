import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_FILE_SEARCH_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-file-search',
    keys: [
      'file desktop-search-start',
      'file desktop-search-status',
      'file desktop-search-cancel',
      'file desktop-search-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-file-search.js')).WORKSPACE_FILE_SEARCH_HANDLERS
  }
]
