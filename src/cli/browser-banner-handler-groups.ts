import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_BANNER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-banner',
    keys: [
      'browser banner resource-dismiss',
      'browser banner cancel-grab',
      'browser banner send-menu-open',
      'browser banner send-menu-close',
      'browser banner status'
    ],
    load: async () => (await import('./handlers/browser-banner.js')).BROWSER_BANNER_HANDLERS
  }
]
