import { BROWSER_SERVER_REOPEN_HANDLER_GROUPS } from './browser-server-reopen-handler-groups'
import { BROWSER_GRAB_TOAST_HANDLER_GROUPS } from './browser-grab-toast-handler-groups'
import { BROWSER_WEBAUTHN_FOCUS_HANDLER_GROUPS } from './browser-webauthn-focus-handler-groups'
import { BROWSER_EGRESS_HANDLER_GROUPS } from './browser-egress-handler-groups'
import { BROWSER_IMPORT_HINT_HANDLER_GROUPS } from './browser-import-hint-handler-groups'
import { BROWSER_BANNER_HANDLER_GROUPS } from './browser-banner-handler-groups'
import { BROWSER_OVERLAY_FOCUS_HANDLER_GROUPS } from './browser-overlay-focus-handler-groups'
import { BROWSER_READER_HANDLER_GROUPS } from './browser-reader-handler-groups'
import { BROWSER_SETUP_GUIDE_HANDLER_GROUPS } from './browser-setup-guide-handler-groups'
import { CLIENT_HOSTED_BROWSER_ROW_HANDLER_GROUPS } from './client-hosted-browser-row-handler-groups'
import { BROWSER_FEATURE_WALL_HANDLER_GROUPS } from './browser-feature-wall-handler-groups'
import { BROWSER_TAKE_BACK_HANDLER_GROUPS } from './browser-take-back-handler-groups'
import type { HandlerGroup } from './handler-group-manifest'

export const BROWSER_VIEWER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  ...BROWSER_SERVER_REOPEN_HANDLER_GROUPS,
  {
    name: 'browser-client-navigation',
    keys: ['browser client-navigate'],
    load: async () =>
      (await import('./handlers/browser-client-navigation.js')).BROWSER_CLIENT_NAVIGATION_HANDLERS
  },
  ...BROWSER_GRAB_TOAST_HANDLER_GROUPS,
  ...BROWSER_WEBAUTHN_FOCUS_HANDLER_GROUPS,
  ...BROWSER_EGRESS_HANDLER_GROUPS,
  ...BROWSER_IMPORT_HINT_HANDLER_GROUPS,
  ...BROWSER_BANNER_HANDLER_GROUPS,
  ...BROWSER_OVERLAY_FOCUS_HANDLER_GROUPS,
  ...BROWSER_READER_HANDLER_GROUPS,
  ...BROWSER_SETUP_GUIDE_HANDLER_GROUPS,
  ...CLIENT_HOSTED_BROWSER_ROW_HANDLER_GROUPS,
  ...BROWSER_FEATURE_WALL_HANDLER_GROUPS,
  ...BROWSER_TAKE_BACK_HANDLER_GROUPS,
  {
    name: 'browser-client-markup',
    keys: ['browser client-markup'],
    load: async () =>
      (await import('./handlers/browser-client-markup.js')).BROWSER_CLIENT_MARKUP_HANDLERS
  },
  {
    name: 'browser-ssh-route',
    keys: ['browser ssh-route'],
    load: async () => (await import('./handlers/browser-ssh-route.js')).BROWSER_SSH_ROUTE_HANDLERS
  },
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
      'browser new-ui',
      'browser download-ui',
      'browser grab-action',
      'browser viewport-pan',
      'browser markup-hint',
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
      'browser grab shortcut-copy',
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
