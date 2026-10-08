import type { WorkspaceCleanupScanRequests } from '../../../workspace-cleanup-scan-requests'
import {
  DesktopCleanupScanStart,
  DesktopCleanupScanRequest
} from '../../../../shared/rpc-contract/workspace-cleanup-scan-params'
import { defineMethod } from '../core'
let scan: WorkspaceCleanupScanRequests | null = null
export function setDesktopCleanupScanForRpc(value: WorkspaceCleanupScanRequests | null): void {
  scan = value
}
function requireScan(): WorkspaceCleanupScanRequests {
  if (!scan) {
    throw new Error('runtime_unavailable')
  }
  return scan
}
export const WORKSPACE_CLEANUP_SCAN_METHODS = [
  defineMethod({
    name: 'workspaceCleanup.scanStart',
    params: DesktopCleanupScanStart,
    handler: (params) => {
      const { expectedExecutionHostId: _host, ...args } = params
      return requireScan().start(args)
    }
  }),
  defineMethod({
    name: 'workspaceCleanup.scanStatus',
    params: DesktopCleanupScanRequest,
    handler: (params) => requireScan().status(params.requestId)
  }),
  defineMethod({
    name: 'workspaceCleanup.scanCancel',
    params: DesktopCleanupScanRequest,
    handler: (params) => requireScan().cancel(params.requestId)
  }),
  defineMethod({
    name: 'workspaceCleanup.scanResult',
    params: DesktopCleanupScanRequest,
    handler: (params) => requireScan().result(params.requestId)
  })
]
