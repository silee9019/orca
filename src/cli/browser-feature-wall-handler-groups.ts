import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_FEATURE_WALL_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-feature-wall',
    keys: ['browser feature-wall'],
    load: async () =>
      (await import('./handlers/browser-feature-wall.js')).BROWSER_FEATURE_WALL_HANDLERS
  }
]
