import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_READER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-readers',
    keys: ['runtime browser-drivers', 'runtime client-browser-rows'],
    load: async () => (await import('./handlers/browser-readers.js')).BROWSER_READER_HANDLERS
  }
]
