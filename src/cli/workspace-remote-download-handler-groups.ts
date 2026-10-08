import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_REMOTE_DOWNLOAD_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-remote-file-download',
    keys: [
      'file remote-file-download-start',
      'file remote-file-download-status',
      'file remote-file-download-cancel'
    ],
    load: async () =>
      (await import('./handlers/workspace-remote-file-download.js'))
        .WORKSPACE_REMOTE_FILE_DOWNLOAD_HANDLERS
  },
  {
    name: 'workspace-remote-folder-download',
    keys: [
      'file remote-folder-download-start',
      'file remote-folder-download-status',
      'file remote-folder-download-cancel'
    ],
    load: async () =>
      (await import('./handlers/workspace-remote-folder-download.js'))
        .WORKSPACE_REMOTE_FOLDER_DOWNLOAD_HANDLERS
  }
]
