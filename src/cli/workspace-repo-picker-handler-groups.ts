import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_REPO_PICKER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-repo-icon-picker',
    keys: [
      'repo icon-picker-start',
      'repo icon-picker-status',
      'repo icon-picker-cancel',
      'repo icon-picker-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-repo-icon-picker.js')).WORKSPACE_REPO_ICON_PICKER_HANDLERS
  },
  {
    name: 'workspace-repo-folder-picker',
    keys: [
      'repo folder-picker-start',
      'repo folder-picker-status',
      'repo folder-picker-cancel',
      'repo folder-picker-result'
    ],
    load: async () =>
      (await import('./handlers/workspace-repo-folder-picker.js'))
        .WORKSPACE_REPO_FOLDER_PICKER_HANDLERS
  }
]
