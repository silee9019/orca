import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_CLIENT_HISTORY_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-client-history',
    keys: ['browser client-history'],
    load: async () =>
      (await import('./handlers/browser-client-history.js')).BROWSER_CLIENT_HISTORY_HANDLERS
  }
]
