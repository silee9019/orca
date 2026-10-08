import type { HandlerGroup } from './handler-group-manifest'

export const CONNECTIONS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'connections-viewer',
    keys: ['connections viewer'],
    load: async () => (await import('./handlers/connections-viewer.js')).CONNECTIONS_VIEWER_HANDLERS
  },
  {
    name: 'ssh',
    keys: [
      'ssh forward watch',
      'ssh ports watch',
      'ssh credential watch',
      'ssh watch',
      'ssh browse',
      'ssh credential list',
      'ssh target list',
      'ssh target add',
      'ssh target update',
      'ssh target rm',
      'ssh target removed',
      'ssh config list',
      'ssh config resolve',
      'ssh config import',
      'ssh connect',
      'ssh disconnect',
      'ssh status',
      'ssh test',
      'ssh reset',
      'ssh terminate',
      'ssh credential required',
      'ssh credential submit',
      'ssh credential cancel',
      'ssh forward list',
      'ssh forward add',
      'ssh forward update',
      'ssh forward rm',
      'ssh ports'
    ],
    load: async () => (await import('./handlers/ssh.js')).SSH_HANDLERS
  },
  {
    name: 'environment-connections',
    keys: [
      'environment connection browser-placement',
      'environment connection probe',
      'environment connection list',
      'environment connection show',
      'environment connection add',
      'environment connection connect',
      'environment connection disconnect',
      'environment connection status',
      'environment connection rm'
    ],
    load: async () =>
      (await import('./handlers/environment-connections.js')).ENVIRONMENT_CONNECTION_HANDLERS
  },
  {
    name: 'mobile-connections',
    keys: [
      'mobile relay watch',
      'mobile network',
      'mobile status',
      'mobile relay',
      'mobile devices',
      'mobile grants',
      'mobile device revoke',
      'mobile grant revoke',
      'mobile firewall status',
      'mobile pairing create',
      'mobile runtime-pairing create'
    ],
    load: async () => (await import('./handlers/mobile-connections.js')).MOBILE_CONNECTION_HANDLERS
  },
  {
    name: 'network-connections',
    keys: ['network connection test'],
    load: async () =>
      (await import('./handlers/network-connections.js')).NETWORK_CONNECTION_HANDLERS
  },
  {
    name: 'mobile-network-human-actions',
    keys: [
      'mobile network-action start',
      'mobile network-action status',
      'mobile network-action cancel',
      'mobile network-action verify',
      'mobile network-action complete'
    ],
    load: async () =>
      (await import('./handlers/mobile-network-human-actions.js')).MOBILE_NETWORK_HUMAN_HANDLERS
  }
]
