import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_SPACE_SCAN_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-space-scan',
    keys: [
      'workspace-space scan-start',
      'workspace-space scan-status',
      'workspace-space scan-cancel',
      'workspace-space scan-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-space-scan.js')).WORKSPACE_SPACE_SCAN_HANDLERS
  }
]
