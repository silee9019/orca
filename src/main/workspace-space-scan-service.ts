import type { Store } from './persistence'
import { analyzeWorkspaceSpace } from './workspace-space-analysis'
import { persistWorkspaceSpaceAnalysisSnapshot } from './workspace-space-analysis-snapshot'
import { WorkspaceSpaceScanController } from './workspace-space-scan-controller'
const controllers = new WeakMap<Store, WorkspaceSpaceScanController>()
export function getWorkspaceSpaceScanController(store: Store): WorkspaceSpaceScanController {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new WorkspaceSpaceScanController(
      (options) => analyzeWorkspaceSpace(store, options),
      (analysis) => {
        void persistWorkspaceSpaceAnalysisSnapshot(store.getProfileStorageDirectory(), analysis)
      }
    )
    controllers.set(store, controller)
  }
  return controller
}
