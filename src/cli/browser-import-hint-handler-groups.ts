import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_IMPORT_HINT_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-import-hint',
    keys: ['browser import-hint'],
    load: async () =>
      (await import('./handlers/browser-import-hint.js')).BROWSER_IMPORT_HINT_HANDLERS
  }
]
