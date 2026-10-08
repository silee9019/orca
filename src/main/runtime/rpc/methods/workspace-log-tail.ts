import {
  DesktopLogTailStart,
  DesktopLogTailRead,
  DesktopLogTailRequest
} from '../../../../shared/rpc-contract/workspace-log-tail-params'
import type { DesktopLogTailService } from '../../../desktop-log-tail-requests'
import { defineMethod } from '../core'
let service: DesktopLogTailService | null = null
export function setDesktopLogTailForRpc(value: DesktopLogTailService | null): void {
  if (service?.controller !== value?.controller) {
    service?.controller.dispose()
  }
  service = value
}
function requireService(): DesktopLogTailService {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}
export const WORKSPACE_LOG_TAIL_METHODS = [
  defineMethod({
    name: 'files.desktopLogTailRead',
    params: DesktopLogTailRead,
    handler: (params) => requireService().read(params)
  }),
  defineMethod({
    name: 'files.desktopLogTailStart',
    params: DesktopLogTailStart,
    handler: (params) => requireService().start(params)
  }),
  defineMethod({
    name: 'files.desktopLogTailStatus',
    params: DesktopLogTailRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'files.desktopLogTailStop',
    params: DesktopLogTailRequest,
    handler: (params) => requireService().controller.stop(params.requestId)
  })
]
