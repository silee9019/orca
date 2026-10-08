import type { HandlerGroup } from './handler-group-manifest'

export const ACCOUNT_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'account-mounted-viewer',
    keys: ['account-view mounted'],
    load: async () =>
      (await import('./handlers/account-mounted-viewer.js')).ACCOUNT_MOUNTED_VIEWER_HANDLERS
  },
  {
    name: 'account-preference',
    keys: ['account preference status', 'account preference set'],
    load: async () => (await import('./handlers/account-preference.js')).ACCOUNT_PREFERENCE_HANDLERS
  },
  {
    name: 'antigravity-accounts',
    keys: [
      'account antigravity list',
      'account antigravity add-current',
      'account antigravity select',
      'account antigravity rm',
      'account antigravity usage'
    ],
    load: async () =>
      (await import('./handlers/antigravity-accounts.js')).ANTIGRAVITY_ACCOUNT_HANDLERS
  },
  {
    name: 'agent-permission-mode',
    keys: ['agent-permissions status', 'agent-permissions set'],
    load: async () =>
      (await import('./handlers/agent-permission-mode.js')).AGENT_PERMISSION_MODE_HANDLERS
  },
  {
    name: 'account-credentials',
    keys: ['credentials status', 'credentials save', 'credentials clear'],
    load: async () =>
      (await import('./handlers/account-credentials.js')).ACCOUNT_CREDENTIAL_HANDLERS
  },
  {
    name: 'account-login',
    keys: ['account login start', 'account login status', 'account login cancel'],
    load: async () => (await import('./handlers/account-login.js')).ACCOUNT_LOGIN_HANDLERS
  },
  {
    name: 'profile-auth',
    keys: [
      'profile auth start',
      'profile auth status',
      'profile auth cancel',
      'profile auth refresh',
      'profile auth sign-out',
      'profile auth select-org'
    ],
    load: async () => (await import('./handlers/profile-auth.js')).PROFILE_AUTH_HANDLERS
  },
  {
    name: 'account-secret-settings',
    keys: ['secrets set', 'secrets clear'],
    load: async () =>
      (await import('./handlers/account-secret-settings.js')).ACCOUNT_SECRET_SETTING_HANDLERS
  }
]
