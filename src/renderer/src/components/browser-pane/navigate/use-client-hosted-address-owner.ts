import { useAppStore } from '@/store'
import type { RuntimeBrowserClientPlacement } from '../../../../../shared/runtime-browser-placement'
import type { BrowserAddressCommandOwner } from '../assemble-chrome/use-browser-address-commands'
export function useClientHostedAddressOwner(params: {
  page: string
  worktreeId: string
  environmentId: string
  active: boolean
  placement: RuntimeBrowserClientPlacement | null
}): BrowserAddressCommandOwner | undefined {
  const handle = useAppStore((state) => state.remoteBrowserPageHandlesByPageId[params.page])
  if (!params.placement || !handle) {
    return undefined
  }
  return {
    page: params.page,
    active: params.active,
    clientTarget: {
      page: params.page,
      worktreeId: params.worktreeId,
      environmentId: params.environmentId,
      remotePageId: handle.remotePageId,
      browserHostClientId: params.placement.browserHostClientId,
      browserHostGeneration: params.placement.browserHostGeneration,
      pageHostGeneration: params.placement.pageHostGeneration
    }
  }
}
