import type { HandlerGroup } from './handler-group-manifest'

export const ACCOUNT_VIEWER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'account-viewer',
    keys: [
      'account-view configure-usage',
      'account-view codex-login-link',
      'account-view open-bitbucket-docs',
      'account-view open-session-log',
      'account-view open-settings',
      'account-view queue-codex-restarts'
    ],
    load: async () => (await import('./handlers/account-viewer.js')).ACCOUNT_VIEWER_HANDLERS
  }
]
