import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_TOOLBAR_EXTERNAL_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-toolbar-external',
    keys: ['browser toolbar-external'],
    load: async () =>
      (await import('./handlers/browser-toolbar-external.js')).BROWSER_TOOLBAR_EXTERNAL_HANDLERS
  }
]
