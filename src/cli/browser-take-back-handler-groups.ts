import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_TAKE_BACK_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-take-back',
    keys: ['browser take-back'],
    load: async () => (await import('./handlers/browser-take-back.js')).BROWSER_TAKE_BACK_HANDLERS
  }
]
