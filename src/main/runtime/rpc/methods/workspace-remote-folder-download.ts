import {
  RemoteFolderDownloadStart,
  RemoteFolderDownloadRequest
} from '../../../../shared/rpc-contract/workspace-remote-folder-download-params'
import type { RemoteFolderDownloadService } from '../../../remote-folder-download-requests'
import { defineMethod } from '../core'
let service: RemoteFolderDownloadService | null = null
export function setRemoteFolderDownloadForRpc(value: RemoteFolderDownloadService | null): void {
  if (service?.controller !== value?.controller) {
    if (value && service?.controller.hasUnfinishedWork()) {
      throw new Error('remote_folder_download_busy')
    }
    void service?.controller.dispose()
  }
  service = value
}
function requireService() {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}
export const WORKSPACE_REMOTE_FOLDER_DOWNLOAD_METHODS = [
  defineMethod({
    name: 'files.remoteFolderDownloadStart',
    params: RemoteFolderDownloadStart,
    handler: (params) => requireService().start(params)
  }),
  defineMethod({
    name: 'files.remoteFolderDownloadStatus',
    params: RemoteFolderDownloadRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'files.remoteFolderDownloadCancel',
    params: RemoteFolderDownloadRequest,
    handler: (params) => requireService().controller.cancel(params.requestId)
  })
]
