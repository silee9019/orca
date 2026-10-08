import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_EXTERNAL_PATH_IMPORT_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-external-path-import',
    keys: ['file import-external-paths', 'file resolve-dropped-paths'],
    load: async () =>
      (await import('./handlers/workspace-external-path-import.js'))
        .WORKSPACE_EXTERNAL_PATH_IMPORT_HANDLERS
  }
]
