import type { Store } from './persistence'
import { scanWorkspaceCleanup } from './ipc/workspace-cleanup-scan'
import { WorkspaceCleanupScanRequests } from './workspace-cleanup-scan-requests'
const scans = new WeakMap<Store, WorkspaceCleanupScanRequests>()
export function getWorkspaceCleanupCliScan(store: Store): WorkspaceCleanupScanRequests {
  let scan = scans.get(store)
  if (!scan) {
    scan = new WorkspaceCleanupScanRequests((args, options) =>
      scanWorkspaceCleanup(store, args, options)
    )
    scans.set(store, scan)
  }
  return scan
}
