import {
  DesktopDownloadSessionStart,
  DesktopDownloadSessionRequest,
  DesktopDownloadSessionAppend
} from '../../../../shared/rpc-contract/workspace-download-session-params'
import type { DesktopDownloadSessionService } from '../../../desktop-download-session-requests'
import { defineMethod } from '../core'
let service: DesktopDownloadSessionService | null = null
export function setDesktopDownloadSessionForRpc(value: DesktopDownloadSessionService | null): void {
  if (service?.controller !== value?.controller) {
    service?.controller.dispose()
  }
  service = value
}
function requireService() {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}
export const WORKSPACE_DOWNLOAD_SESSION_METHODS = [
  defineMethod({
    name: 'files.desktopDownloadSessionStart',
    params: DesktopDownloadSessionStart,
    handler: (params) => requireService().start(params)
  }),
  defineMethod({
    name: 'files.desktopDownloadSessionStatus',
    params: DesktopDownloadSessionRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'files.desktopDownloadSessionAppend',
    params: DesktopDownloadSessionAppend,
    handler: (params) =>
      requireService().controller.append(
        params.requestId,
        params.expectedByteOffset,
        params.contentBase64
      )
  }),
  defineMethod({
    name: 'files.desktopDownloadSessionFinish',
    params: DesktopDownloadSessionRequest,
    handler: (params) => requireService().controller.finish(params.requestId)
  }),
  defineMethod({
    name: 'files.desktopDownloadSessionCancel',
    params: DesktopDownloadSessionRequest,
    handler: (params) => requireService().controller.cancel(params.requestId)
  })
]
