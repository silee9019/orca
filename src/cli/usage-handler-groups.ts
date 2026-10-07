import type { HandlerGroup } from './handler-group-manifest'

export const USAGE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'usage',
    keys: [
      'usage feature-wall-signin',
      'usage feature-wall-signin-status',
      'usage feature-wall-signin-cancel',
      'usage refresh-account-state',
      'usage inline-signin',
      'usage inline-signin-status',
      'usage inline-signin-cancel',
      'usage roster-signin',
      'usage refresh-account-usage',
      'usage percentage-settings',
      'usage viewer-set-enabled',
      'usage viewer-refresh',
      'usage record-interaction',
      'usage skill-example',
      'usage set-context-open',
      'usage dismiss-notice',
      'usage set-menu-open',
      'usage share',
      'usage select-tab',
      'usage set-filters',
      'usage set-display-mode',
      'usage scan-state',
      'usage set-enabled',
      'usage refresh',
      'usage snapshot',
      'usage summary',
      'usage daily',
      'usage breakdown',
      'usage sessions'
    ],
    load: async () => (await import('./handlers/usage.js')).USAGE_HANDLERS
  },
  {
    name: 'rate-limits',
    keys: [
      'rate-limit get',
      'rate-limit refresh',
      'rate-limit refresh-target',
      'rate-limit set-polling-interval',
      'rate-limit fetch-inactive',
      'rate-limit consume-codex-reset-credit',
      'rate-limit observe',
      'rate-limit observe-stream'
    ],
    load: async () => (await import('./handlers/rate-limits.js')).RATE_LIMIT_HANDLERS
  }
]
