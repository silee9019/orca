import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_SETUP_GUIDE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-setup-guide',
    keys: ['browser setup-guide'],
    load: async () =>
      (await import('./handlers/browser-setup-guide.js')).BROWSER_SETUP_GUIDE_HANDLERS
  }
]
