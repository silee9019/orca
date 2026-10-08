import type { BrowserClientNavigationTarget } from '../../../shared/rpc-contract/browser-client-navigation-params'
import type { BrowserClientStagedTarget } from '../../../shared/rpc-contract/browser-client-deferred-params'
import type { RuntimeBrowserClientPlacement } from '../../../shared/runtime-browser-placement'
import type { RemoteBrowserPageHandle } from '@/store/slices/browser/browser-slice-contract'
import { isBrowserClientPageViewerTargetCurrent } from './browser-client-page-viewer-target'
import { isBrowserClientStagedTargetCurrent } from './browser-client-staged-viewer-target'
import { matchesBrowserClientPageCommandTarget } from './browser-client-page-command-target'
export type BrowserClientDocumentSource =
  | { kind: 'materialized'; target: BrowserClientNavigationTarget }
  | { kind: 'staged'; target: BrowserClientStagedTarget }
export function isBrowserClientDocumentSourceCurrent(
  source: BrowserClientDocumentSource,
  placement?: RuntimeBrowserClientPlacement | null
): boolean {
  return source.kind === 'staged'
    ? !placement && isBrowserClientStagedTargetCurrent(source.target)
    : isBrowserClientPageViewerTargetCurrent(source.target, placement)
}
export function matchesBrowserClientDocumentSourceHandle(
  source: BrowserClientDocumentSource,
  handle: RemoteBrowserPageHandle | undefined,
  placement: RuntimeBrowserClientPlacement | null,
  offeredHandle: RemoteBrowserPageHandle | undefined
): boolean {
  if (source.kind === 'materialized') {
    return matchesBrowserClientPageCommandTarget(
      handle,
      source.target.environmentId,
      source.target,
      placement
    )
  }
  return Boolean(
    !placement &&
    handle &&
    handle === offeredHandle &&
    handle.environmentId === source.target.environmentId &&
    handle.remotePageId === source.target.remotePageId &&
    handle.staged &&
    handle.stagedClientHosted &&
    !handle.placement &&
    !handle.restoredFromSession &&
    !handle.restoredClientHosted
  )
}
