import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_OBSERVATION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-observation',
    keys: ['browser observe', 'runtime browser-observe'],
    load: async () =>
      (await import('./handlers/browser-observation.js')).BROWSER_OBSERVATION_HANDLERS
  }
]
