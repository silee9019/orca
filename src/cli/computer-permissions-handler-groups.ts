import type { HandlerGroup } from './handler-group-manifest'
export const COMPUTER_PERMISSIONS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'computer-permissions-viewer',
    keys: ['computer permissions viewer'],
    load: async () =>
      (await import('./handlers/computer-permissions-viewer.js'))
        .COMPUTER_PERMISSIONS_VIEWER_HANDLERS
  }
]
