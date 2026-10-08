import {
  DesktopNestedScanStart,
  DesktopNestedScanRequest,
  DesktopNestedScanResult
} from '../../../../shared/rpc-contract/workspace-nested-scan-params'
import type { DesktopNestedScanService } from '../../../desktop-nested-scan-service'
import { defineMethod } from '../core'
let service: DesktopNestedScanService | null = null
export function setDesktopNestedScanForRpc(value: DesktopNestedScanService | null): void {
  if (service?.controller !== value?.controller) {
    service?.controller.dispose()
  }
  service = value
}
function requireService(): DesktopNestedScanService {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}
export const WORKSPACE_NESTED_SCAN_METHODS = [
  defineMethod({
    name: 'projectGroups.desktopScanStart',
    params: DesktopNestedScanStart,
    handler: (params) => requireService().start(params)
  }),
  defineMethod({
    name: 'projectGroups.desktopScanStatus',
    params: DesktopNestedScanRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'projectGroups.desktopScanCancel',
    params: DesktopNestedScanRequest,
    handler: (params) => requireService().controller.cancel(params.requestId)
  }),
  defineMethod({
    name: 'projectGroups.desktopScanResult',
    params: DesktopNestedScanResult,
    handler: (params) =>
      requireService().controller.result(params.requestId, params.offset, params.limit)
  })
]
