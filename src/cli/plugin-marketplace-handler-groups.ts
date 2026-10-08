import type { HandlerGroup } from './handler-group-manifest'
export const PLUGIN_MARKETPLACE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'plugin-marketplace-viewer',
    keys: ['plugins marketplace viewer'],
    load: async () =>
      (await import('./handlers/plugin-marketplace-viewer.js')).PLUGIN_MARKETPLACE_VIEWER_HANDLERS
  }
]
