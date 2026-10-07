import type { HandlerGroup } from './handler-group-manifest'
export const TCC_THRESHOLD_OBSERVE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'tcc-threshold-observe',
    keys: ['permissions tcc observe'],
    load: async () =>
      (await import('./handlers/tcc-threshold-observe.js')).TCC_THRESHOLD_OBSERVE_HANDLERS
  }
]
