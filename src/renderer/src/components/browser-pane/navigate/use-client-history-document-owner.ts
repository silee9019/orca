import { useAppStore } from '@/store'
import type { RuntimeBrowserClientPlacement } from '../../../../../shared/runtime-browser-placement'
import type { BrowserHistoryDocumentOwner } from '../assemble-chrome/use-client-history-document-commands'

export function useClientHistoryDocumentOwner(params: {
  page: string
  worktreeId: string
  environmentId: string
  active: boolean
  placement: RuntimeBrowserClientPlacement | null
}): BrowserHistoryDocumentOwner | undefined {
  const handle = useAppStore((state) => state.remoteBrowserPageHandlesByPageId[params.page])
  if (!handle) {
    return undefined
  }
  if (
    !params.placement &&
    (!handle.staged ||
      !handle.stagedClientHosted ||
      handle.placement ||
      handle.restoredFromSession ||
      handle.restoredClientHosted)
  ) {
    return undefined
  }
  const target = {
    page: params.page,
    worktreeId: params.worktreeId,
    environmentId: params.environmentId,
    remotePageId: handle.remotePageId
  }
  return {
    active: params.active,
    source: params.placement
      ? {
          kind: 'materialized',
          target: {
            ...target,
            browserHostClientId: params.placement.browserHostClientId,
            browserHostGeneration: params.placement.browserHostGeneration,
            pageHostGeneration: params.placement.pageHostGeneration
          }
        }
      : { kind: 'staged', target }
  }
}
