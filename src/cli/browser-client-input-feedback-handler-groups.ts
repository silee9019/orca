import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_CLIENT_INPUT_FEEDBACK_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-client-input-feedback',
    keys: ['browser client-input-feedback'],
    load: async () =>
      (await import('./handlers/browser-client-input-feedback.js'))
        .BROWSER_CLIENT_INPUT_FEEDBACK_HANDLERS
  }
]
