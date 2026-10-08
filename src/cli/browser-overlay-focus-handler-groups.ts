import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_OVERLAY_FOCUS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-overlay-focus',
    keys: ['browser owning-group-focus'],
    load: async () =>
      (await import('./handlers/browser-overlay-focus.js')).BROWSER_OVERLAY_FOCUS_HANDLERS
  }
]
