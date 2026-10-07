import type { HandlerGroup } from './handler-group-manifest'

export const OS_PERMISSION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'os-permissions',
    keys: [
      'notification play-sound',
      'computer permission-status',
      'computer permissions-reset',
      'permissions status',
      'permissions request',
      'permissions open-settings',
      'permissions daemon-attribution',
      'permissions tcc status',
      'permissions tcc consume',
      'permissions tcc acknowledge',
      'permissions tcc release',
      'permissions tcc dismiss',
      'notification permission-status',
      'notification away-status',
      'notification probe',
      'notification open-settings',
      'notification dispatch',
      'notification dismiss'
    ],
    load: async () => (await import('./handlers/os-permissions.js')).OS_PERMISSION_HANDLERS
  }
]
