import type { HandlerGroup } from './handler-group-manifest'

export const WORKSPACE_LINEAGE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-lineage',
    keys: ['worktree update-desktop-lineage'],
    load: async () => (await import('./handlers/workspace-lineage.js')).WORKSPACE_LINEAGE_HANDLERS
  }
]
