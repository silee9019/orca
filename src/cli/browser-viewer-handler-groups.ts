import type { HandlerGroup } from './handler-group-manifest'

export const BROWSER_VIEWER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-group-ui',
    keys: ['browser group-ui'],
    load: async () => (await import('./handlers/browser-group-ui.js')).BROWSER_GROUP_UI_HANDLERS
  },
  {
    name: 'browser-markup-gesture',
    keys: ['browser markup gesture'],
    load: async () =>
      (await import('./handlers/browser-markup-gesture.js')).BROWSER_MARKUP_GESTURE_HANDLERS
  },
  {
    name: 'browser-tab-ui',
    keys: ['browser tab-ui'],
    load: async () => (await import('./handlers/browser-tab-ui.js')).BROWSER_TAB_UI_HANDLERS
  },
  {
    name: 'browser-session',
    keys: [
      'tab profile detect-browsers',
      'tab profile import-browser',
      'tab profile import-file',
      'tab profile clear-default-cookies',
      'browser certificate proceed'
    ],
    load: async () => (await import('./handlers/browser-session.js')).BROWSER_SESSION_HANDLERS
  },
  {
    name: 'browser-viewer',
    keys: [
      'browser reload-menu',
      'browser annotation tray',
      'browser address',
      'browser profile-ui',
      'browser markup copy',
      'browser markup text-commit',
      'browser markup text-cancel',
      'browser markup tool',
      'browser markup color',
      'browser markup width',
      'browser markup font-size',
      'browser markup undo',
      'browser markup redo',
      'browser markup clear',
      'browser markup editor-status',
      'browser markup start',
      'browser markup cancel',
      'browser markup status',
      'browser annotation row',
      'browser context-menu',
      'browser grab start',
      'browser grab toggle',
      'browser grab cancel',
      'browser grab rearm',
      'browser grab exit',
      'browser grab copy',
      'browser grab copy-screenshot',
      'browser grab status',
      'browser toolbar-nav',
      'browser find-ui open',
      'browser find-ui query',
      'browser find-ui next',
      'browser find-ui previous',
      'browser find-ui close',
      'browser find-ui status',
      'browser zoom',
      'browser download cancel',
      'browser devtools open',
      'browser webauthn respond',
      'browser webauthn cancel',
      'browser annotation draft-status',
      'browser annotation draft-cancel',
      'browser annotation add',
      'browser annotation list',
      'browser annotation update',
      'browser annotation rm',
      'browser annotation clear',
      'browser history list',
      'browser history clear',
      'browser viewport-preset set'
    ],
    load: async () => (await import('./handlers/browser-viewer.js')).BROWSER_VIEWER_HANDLERS
  }
]
