import type { HandlerGroup } from './handler-group-manifest'
export const RESOURCE_MANAGER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'resource-manager',
    keys: ['resource-manager status', 'resource-manager apply'],
    load: async () => (await import('./handlers/resource-manager.js')).RESOURCE_MANAGER_HANDLERS
  }
]
