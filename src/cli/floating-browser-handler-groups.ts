import type { HandlerGroup } from './handler-group-manifest'
export const FLOATING_BROWSER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'floating-browser-viewer',
    keys: ['browser floating viewer'],
    load: async () =>
      (await import('./handlers/floating-browser-viewer.js')).FLOATING_BROWSER_VIEWER_HANDLERS
  }
]
