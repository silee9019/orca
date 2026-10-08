import type { RepoPickerRequests } from '../../../repo-picker-requests'
import {
  RepoIconPickerStart,
  RepoIconPickerRequest
} from '../../../../shared/rpc-contract/workspace-repo-icon-picker-params'
import { defineMethod } from '../core'
let repoIconPicker: RepoPickerRequests | null = null
export function setDesktopRepoIconPickerForRpc(picker: RepoPickerRequests | null): void {
  repoIconPicker = picker
}
function requireRepoIconPicker(): RepoPickerRequests {
  if (!repoIconPicker) {
    throw new Error('runtime_unavailable')
  }
  return repoIconPicker
}
export const WORKSPACE_REPO_ICON_PICKER_METHODS = [
  defineMethod({
    name: 'repoIconPicker.start',
    params: RepoIconPickerStart,
    handler: () => requireRepoIconPicker().start()
  }),
  defineMethod({
    name: 'repoIconPicker.status',
    params: RepoIconPickerRequest,
    handler: (params) => requireRepoIconPicker().status(params.requestId, 'icon')
  }),
  defineMethod({
    name: 'repoIconPicker.cancel',
    params: RepoIconPickerRequest,
    handler: (params) => requireRepoIconPicker().cancel(params.requestId, 'icon')
  }),
  defineMethod({
    name: 'repoIconPicker.result',
    params: RepoIconPickerRequest,
    handler: (params) => requireRepoIconPicker().result(params.requestId)
  })
]
