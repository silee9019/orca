import type { HandlerGroup } from './handler-group-manifest'

export const BROWSER_DOCUMENT_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-document',
    keys: ['browser document'],
    load: async () => (await import('./handlers/browser-document.js')).BROWSER_DOCUMENT_HANDLERS
  }
]
