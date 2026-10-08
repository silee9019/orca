import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_TITLEBAR_PAIRED_ACTIVATION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-titlebar-paired-activation',
    keys: ['browser titlebar-activate-paired'],
    load: async () =>
      (await import('./handlers/browser-titlebar-paired-activation.js'))
        .BROWSER_TITLEBAR_PAIRED_ACTIVATION_HANDLERS
  }
]
