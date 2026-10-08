import {
  RemoteFileDownloadStart,
  RemoteFileDownloadRequest
} from '../../../../shared/rpc-contract/workspace-remote-file-download-params'
import type { RemoteFileDownloadService } from '../../../remote-file-download-requests'
import { defineMethod } from '../core'
let service: RemoteFileDownloadService | null = null
export function setRemoteFileDownloadForRpc(value: RemoteFileDownloadService | null): void {
  if (service?.controller !== value?.controller) {
    if (value && service?.controller.hasUnfinishedWork()) {
      throw new Error('remote_file_download_busy')
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
export const WORKSPACE_REMOTE_FILE_DOWNLOAD_METHODS = [
  defineMethod({
    name: 'files.remoteFileDownloadStart',
    params: RemoteFileDownloadStart,
    handler: (params) => requireService().start(params)
  }),
  defineMethod({
    name: 'files.remoteFileDownloadStatus',
    params: RemoteFileDownloadRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'files.remoteFileDownloadCancel',
    params: RemoteFileDownloadRequest,
    handler: (params) => requireService().controller.cancel(params.requestId)
  })
]
