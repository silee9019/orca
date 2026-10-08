import type { HandlerGroup } from './handler-group-manifest'

export const EXTENSIONS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'extensions-sidebar',
    keys: ['extensions sidebar'],
    load: async () => (await import('./handlers/extensions-sidebar.js')).EXTENSIONS_SIDEBAR_HANDLERS
  },
  {
    name: 'plugins',
    keys: [
      'plugins panel-read',
      'plugins list',
      'plugins enable',
      'plugins disable',
      'plugins consent',
      'plugins command',
      'plugins panel'
    ],
    load: async () => (await import('./handlers/plugins.js')).PLUGIN_HANDLERS
  },
  {
    name: 'plugins-management',
    keys: [
      'plugins viewer',
      'plugins preferences get',
      'plugins preferences update',
      'plugins install',
      'plugins remove',
      'plugins logs',
      'plugins refresh',
      'plugins language-packs',
      'plugins marketplace list',
      'plugins marketplace plugins',
      'plugins marketplace add',
      'plugins marketplace remove',
      'plugins marketplace refresh',
      'plugins marketplace preview',
      'plugins marketplace install',
      'plugins marketplace preview-update',
      'plugins marketplace rollback'
    ],
    load: async () => (await import('./handlers/plugins-management.js')).PLUGIN_MANAGEMENT_HANDLERS
  },
  {
    name: 'skills-managed',
    keys: [
      'skills viewer',
      'skills delete-supported',
      'skills install-share',
      'skills install-package',
      'skills install-bundle-share',
      'skills install-bundle-package',
      'skills wsl-distros',
      'skills update-acknowledge',
      'skills update-cancel',
      'skills update-status',
      'skills freshness',
      'skills prepare-share',
      'skills publish-share',
      'skills cancel-share',
      'skills release-share',
      'skills update-start',
      'skills resolve-share',
      'skills package',
      'skills revoke-share',
      'skills delete-package',
      'skills delete-version',
      'skills preview-bundle',
      'skills owned-shares',
      'skills discover',
      'skills preview-install',
      'skills install-shared',
      'skills install-bundle',
      'skills preview-delete',
      'skills delete',
      'skills remove-install',
      'skills managed-installs',
      'skills cancel-install',
      'skills install-progress'
    ],
    load: async () => (await import('./handlers/skills-managed.js')).MANAGED_SKILL_HANDLERS
  },
  {
    name: 'automation-extensions',
    keys: [
      'automations viewer',
      'automations external list',
      'automations external runs',
      'automations external create',
      'automations external update',
      'automations external action',
      'automations precheck',
      'automations snapshot-name'
    ],
    load: async () =>
      (await import('./handlers/automation-extensions.js')).AUTOMATION_EXTENSION_HANDLERS
  },
  {
    name: 'sparse-presets',
    keys: [
      'sparse-presets viewer',
      'sparse-presets list',
      'sparse-presets save',
      'sparse-presets remove'
    ],
    load: async () => (await import('./handlers/sparse-presets.js')).SPARSE_PRESET_HANDLERS
  },
  {
    name: 'profiles-managed',
    keys: [
      'profile list',
      'profile auth-status',
      'profile create',
      'profile create-cloud',
      'profile use',
      'profile transfer-project',
      'profile find-projects',
      'profile auth-start',
      'profile auth-operation',
      'profile auth-cancel',
      'profile refresh-auth',
      'profile sign-out',
      'profile select-org',
      'profile org members',
      'profile org invite',
      'profile org revoke-invite',
      'profile org set-role',
      'profile org remove-member'
    ],
    load: async () => (await import('./handlers/profiles-managed.js')).MANAGED_PROFILE_HANDLERS
  }
]
