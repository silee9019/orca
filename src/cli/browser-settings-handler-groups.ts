import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_SETTINGS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-settings-viewer',
    keys: ['browser settings viewer'],
    load: async () =>
      (await import('./handlers/browser-settings-viewer.js')).BROWSER_SETTINGS_VIEWER_HANDLERS
  }
]
