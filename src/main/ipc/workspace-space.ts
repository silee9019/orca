import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type {
  WorkspaceSpaceAnalysis,
  WorkspaceSpaceAnalyzeResult,
  WorkspaceSpaceScanProgress,
  WorkspaceSpaceWorktreeMeasurement
} from '../../shared/workspace-space-types'
import { readWorkspaceSpaceAnalysisSnapshot } from '../workspace-space-analysis-snapshot'
import { getWorkspaceSpaceScanController } from '../workspace-space-scan-service'
import { setWorkspaceSpaceScanForRpc } from '../runtime/rpc/methods/workspace-space-scan'
const PROGRESS_EMIT_INTERVAL_MS = 100
export function registerWorkspaceSpaceHandlers(store: Store): void {
  const snapshotDirectory = store.getProfileStorageDirectory()
  const scans = getWorkspaceSpaceScanController(store)
  setWorkspaceSpaceScanForRpc(scans)
  ipcMain.removeHandler('workspaceSpace:cancel')
  ipcMain.removeHandler('workspaceSpace:analyze')
  ipcMain.removeHandler('workspaceSpace:getCachedAnalysis')
  ipcMain.handle('workspaceSpace:analyze', async (event): Promise<WorkspaceSpaceAnalyzeResult> => {
    let lastProgressSentAt = 0
    let pendingMeasurements: WorkspaceSpaceWorktreeMeasurement[] = []
    const sendProgress = (progress: WorkspaceSpaceScanProgress): void => {
      if (progress.completedMeasurements?.length) {
        pendingMeasurements.push(...progress.completedMeasurements)
      }
      // Batch progress so large fleets do not repaint the Space page per row.
      const now = Date.now()
      const isFirstProgress = lastProgressSentAt === 0
      const isTerminalProgress =
        progress.state !== 'running' ||
        (progress.totalWorktreeCount > 0 &&
          progress.scannedWorktreeCount >= progress.totalWorktreeCount)
      if (
        !isFirstProgress &&
        !isTerminalProgress &&
        now - lastProgressSentAt < PROGRESS_EMIT_INTERVAL_MS
      ) {
        return
      }
      lastProgressSentAt = now
      if (!event.sender.isDestroyed()) {
        const completedMeasurements = pendingMeasurements
        pendingMeasurements = []
        event.sender.send('workspaceSpace:progress', {
          ...progress,
          ...(completedMeasurements.length > 0 ? { completedMeasurements } : {})
        })
      }
    }
    return scans.analyzeForRenderer(sendProgress)
  })
  ipcMain.handle('workspaceSpace:getCachedAnalysis', (): Promise<WorkspaceSpaceAnalysis | null> =>
    readWorkspaceSpaceAnalysisSnapshot(snapshotDirectory)
  )
  ipcMain.handle('workspaceSpace:cancel', async (): Promise<boolean> => scans.cancelForRenderer())
}
