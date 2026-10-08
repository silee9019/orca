import type { HandlerGroup } from './handler-group-manifest'
export const LINKED_BROWSER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'linked-browser-viewer',
    keys: ['browser linked viewer'],
    load: async () =>
      (await import('./handlers/linked-browser-viewer.js')).LINKED_BROWSER_VIEWER_HANDLERS
  }
]
