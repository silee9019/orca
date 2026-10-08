import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_EGRESS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-egress',
    keys: [
      'browser egress open',
      'browser egress close',
      'browser egress settings',
      'browser egress status'
    ],
    load: async () => (await import('./handlers/browser-egress.js')).BROWSER_EGRESS_HANDLERS
  }
]
