import {
  DesktopLocalCloneStart,
  DesktopLocalCloneRequest
} from '../../../../shared/rpc-contract/workspace-local-clone-params'
import type { DesktopLocalCloneService } from '../../../desktop-local-clone-service'
import { defineMethod } from '../core'
let service: DesktopLocalCloneService | null = null
export function setDesktopLocalCloneForRpc(value: DesktopLocalCloneService | null): void {
  if (service?.controller !== value?.controller) {
    service?.controller.dispose()
  }
  service = value
}
function requireService(): DesktopLocalCloneService {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}
export const WORKSPACE_LOCAL_CLONE_METHODS = [
  defineMethod({
    name: 'repo.desktopLocalCloneStart',
    params: DesktopLocalCloneStart,
    handler: (params) => requireService().start(params)
  }),
  defineMethod({
    name: 'repo.desktopLocalCloneStatus',
    params: DesktopLocalCloneRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'repo.desktopLocalCloneCancel',
    params: DesktopLocalCloneRequest,
    handler: (params) => requireService().controller.cancel(params.requestId)
  }),
  defineMethod({
    name: 'repo.desktopLocalCloneResult',
    params: DesktopLocalCloneRequest,
    handler: (params) => requireService().controller.result(params.requestId)
  })
]
