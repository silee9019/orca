import {
  DesktopRemoteCloneStart,
  DesktopRemoteCloneRequest
} from '../../../../shared/rpc-contract/workspace-remote-clone-params'
import type { DesktopRemoteCloneService } from '../../../desktop-remote-clone-service'
import { defineMethod } from '../core'
let service: DesktopRemoteCloneService | null = null
export function setDesktopRemoteCloneForRpc(value: DesktopRemoteCloneService | null): void {
  if (service?.controller !== value?.controller) {
    service?.controller.dispose()
  }
  service = value
}
function requireService(): DesktopRemoteCloneService {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}
export const WORKSPACE_REMOTE_CLONE_METHODS = [
  defineMethod({
    name: 'repo.desktopRemoteCloneStart',
    params: DesktopRemoteCloneStart,
    handler: (params) => requireService().start(params)
  }),
  defineMethod({
    name: 'repo.desktopRemoteCloneStatus',
    params: DesktopRemoteCloneRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'repo.desktopRemoteCloneCancel',
    params: DesktopRemoteCloneRequest,
    handler: (params) => requireService().controller.cancel(params.requestId)
  }),
  defineMethod({
    name: 'repo.desktopRemoteCloneResult',
    params: DesktopRemoteCloneRequest,
    handler: (params) => requireService().controller.result(params.requestId)
  })
]
