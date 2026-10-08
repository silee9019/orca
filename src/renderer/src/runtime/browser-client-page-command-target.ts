import { sameRuntimeBrowserPlacement } from '../../../shared/runtime-browser-placement'
import type { RuntimeBrowserClientPlacement } from '../../../shared/runtime-browser-placement'
import type { BrowserClientPageTarget } from '../../../shared/rpc-contract/browser-client-page-target'
import type { RemoteBrowserPageHandle } from '@/store/slices/browser/browser-slice-contract'
export function matchesBrowserClientPageCommandTarget(
  handle: RemoteBrowserPageHandle | undefined,
  environmentId: string | null,
  target: BrowserClientPageTarget | undefined,
  ownerPlacement?: RuntimeBrowserClientPlacement | null
): boolean {
  if (
    !handle ||
    !environmentId ||
    !target ||
    handle.environmentId !== environmentId ||
    handle.remotePageId !== target.remotePageId ||
    handle.placement?.kind !== 'client' ||
    handle.staged ||
    handle.stagedClientHosted ||
    handle.restoredFromSession ||
    handle.restoredClientHosted ||
    ownerPlacement === null
  ) {
    return false
  }
  const expected: RuntimeBrowserClientPlacement = {
    kind: 'client',
    browserHostClientId: target.browserHostClientId,
    browserHostGeneration: target.browserHostGeneration,
    pageHostGeneration: target.pageHostGeneration
  }
  return (
    sameRuntimeBrowserPlacement(handle.placement, expected) &&
    (ownerPlacement === undefined || sameRuntimeBrowserPlacement(ownerPlacement, expected))
  )
}
