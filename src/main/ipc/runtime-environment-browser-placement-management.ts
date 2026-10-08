import type {
  BrowserClientHostPlacementPreparationRequest,
  BrowserPageCreationPlacement
} from '../../shared/browser-client-host-placement'
type PrepareBrowserPlacement = (
  input: BrowserClientHostPlacementPreparationRequest
) => Promise<BrowserPageCreationPlacement>
let prepare: PrepareBrowserPlacement | null = null
export function setRuntimeBrowserPlacementManagement(value: PrepareBrowserPlacement | null): void {
  prepare = value
}
export function getRuntimeBrowserPlacementManagement(): PrepareBrowserPlacement {
  if (!prepare) {
    throw new Error('runtime_browser_placement_not_registered')
  }
  return prepare
}
