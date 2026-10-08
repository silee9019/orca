import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_SERVER_REOPEN_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-server-reopen',
    keys: ['browser reopen-server'],
    load: async () =>
      (await import('./handlers/browser-server-reopen.js')).BROWSER_SERVER_REOPEN_HANDLERS
  }
]
