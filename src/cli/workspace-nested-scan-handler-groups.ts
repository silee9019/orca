import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_NESTED_SCAN_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-nested-scan',
    keys: [
      'project-group desktop-scan-start',
      'project-group desktop-scan-status',
      'project-group desktop-scan-cancel',
      'project-group desktop-scan-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-nested-scan.js')).WORKSPACE_NESTED_SCAN_HANDLERS
  }
]
