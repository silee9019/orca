import type { HandlerGroup } from './handler-group-manifest'
export const CLIENT_HOSTED_BROWSER_ROW_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'client-hosted-browser-row',
    keys: ['browser hosted-row activate', 'browser hosted-row close'],
    load: async () =>
      (await import('./handlers/client-hosted-browser-row.js')).CLIENT_HOSTED_BROWSER_ROW_HANDLERS
  }
]
