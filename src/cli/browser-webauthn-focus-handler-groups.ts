import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_WEBAUTHN_FOCUS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-webauthn-focus',
    keys: ['browser webauthn dialog-focus'],
    load: async () =>
      (await import('./handlers/browser-webauthn-focus.js')).BROWSER_WEBAUTHN_FOCUS_HANDLERS
  }
]
