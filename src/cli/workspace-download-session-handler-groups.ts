import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_DOWNLOAD_SESSION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-download-session',
    keys: [
      'file save-downloaded',
      'file download-session-start',
      'file download-session-status',
      'file download-session-append',
      'file download-session-finish',
      'file download-session-cancel'
    ],
    load: async () =>
      (await import('./handlers/workspace-download-session.js')).WORKSPACE_DOWNLOAD_SESSION_HANDLERS
  }
]
