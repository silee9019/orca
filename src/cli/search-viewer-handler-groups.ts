import type { HandlerGroup } from './handler-group-manifest'

export const SEARCH_VIEWER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'search-consent',
    keys: ['search consent'],
    load: async () => (await import('./handlers/search-consent.js')).SEARCH_CONSENT_HANDLERS
  },
  {
    name: 'search-settings-viewer',
    keys: ['search viewer'],
    load: async () =>
      (await import('./handlers/search-settings-viewer.js')).SEARCH_SETTINGS_VIEWER_HANDLERS
  }
]
