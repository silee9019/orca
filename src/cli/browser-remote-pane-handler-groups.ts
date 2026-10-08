import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_REMOTE_PANE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-remote-pane',
    keys: ['browser remote-pane'],
    load: async () =>
      (await import('./handlers/browser-remote-pane.js')).BROWSER_REMOTE_PANE_HANDLERS
  }
]
