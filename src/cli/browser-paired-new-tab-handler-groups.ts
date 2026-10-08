import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_PAIRED_NEW_TAB_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-paired-new-tab',
    keys: ['browser new-ui-paired'],
    load: async () =>
      (await import('./handlers/browser-paired-new-tab.js')).BROWSER_PAIRED_NEW_TAB_HANDLERS
  }
]
