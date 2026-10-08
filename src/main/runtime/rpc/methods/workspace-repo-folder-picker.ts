import type { RepoPickerRequests } from '../../../repo-picker-requests'
import {
  RepoFolderPickerStart,
  RepoFolderPickerRequest
} from '../../../../shared/rpc-contract/workspace-repo-folder-picker-params'
import { defineMethod } from '../core'
let picker: RepoPickerRequests | null = null
export function setDesktopRepoFolderPickerForRpc(value: RepoPickerRequests | null): void {
  picker = value
}
function requirePicker(): RepoPickerRequests {
  if (!picker) {
    throw new Error('runtime_unavailable')
  }
  return picker
}
export const WORKSPACE_REPO_FOLDER_PICKER_METHODS = [
  defineMethod({
    name: 'repoFolderPicker.start',
    params: RepoFolderPickerStart,
    handler: (params) => requirePicker().start(params.kind)
  }),
  defineMethod({
    name: 'repoFolderPicker.status',
    params: RepoFolderPickerRequest,
    handler: (params) => requirePicker().status(params.requestId, 'folders')
  }),
  defineMethod({
    name: 'repoFolderPicker.cancel',
    params: RepoFolderPickerRequest,
    handler: (params) => requirePicker().cancel(params.requestId, 'folders')
  }),
  defineMethod({
    name: 'repoFolderPicker.result',
    params: RepoFolderPickerRequest,
    handler: (params) => requirePicker().folderResult(params.requestId)
  })
]
