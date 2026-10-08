import type { WorkspaceSpaceScanController } from '../../../workspace-space-scan-controller'
import {
  WorkspaceSpaceScanStart,
  WorkspaceSpaceScanRequest,
  WorkspaceSpaceScanResult
} from '../../../../shared/rpc-contract/workspace-space-scan-params'
import { defineMethod } from '../core'
let scans: WorkspaceSpaceScanController | null = null
export function setWorkspaceSpaceScanForRpc(value: WorkspaceSpaceScanController | null): void {
  scans = value
}
function requireScans(): WorkspaceSpaceScanController {
  if (!scans) {
    throw new Error('runtime_unavailable')
  }
  return scans
}
export const WORKSPACE_SPACE_SCAN_METHODS = [
  defineMethod({
    name: 'workspaceSpace.scanStart',
    params: WorkspaceSpaceScanStart,
    handler: () => {
      const controller = requireScans()
      try {
        return controller.startCli()
      } catch (error) {
        if (error instanceof Error && error.message === 'workspace_space_scan_busy') {
          throw error
        }
        throw new Error('Desktop workspace space scan could not start.')
      }
    }
  }),
  defineMethod({
    name: 'workspaceSpace.scanStatus',
    params: WorkspaceSpaceScanRequest,
    handler: (params) => requireScans().status(params.requestId)
  }),
  defineMethod({
    name: 'workspaceSpace.scanCancel',
    params: WorkspaceSpaceScanRequest,
    handler: (params) => requireScans().cancelCli(params.requestId)
  }),
  defineMethod({
    name: 'workspaceSpace.scanResult',
    params: WorkspaceSpaceScanResult,
    handler: (params) =>
      requireScans().result(
        params.requestId,
        params.repoOffset,
        params.worktreeOffset,
        params.limit
      )
  })
]
