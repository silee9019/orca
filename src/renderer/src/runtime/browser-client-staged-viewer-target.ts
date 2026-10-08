import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import type { BrowserClientStagedTarget } from '../../../shared/rpc-contract/browser-client-deferred-params'
export function isBrowserClientStagedTargetCurrent(target: BrowserClientStagedTarget): boolean {
  const state = useAppStore.getState()
  const page = findPage(state.browserPagesByWorkspace, target.page)
  const workspace = state.browserTabsByWorktree[target.worktreeId]?.find(
    (workspace) => workspace.id === page?.workspaceId
  )
  const handle = state.remoteBrowserPageHandlesByPageId[target.page]
  return Boolean(
    state.persistedUIReady &&
    state.settings?.activeRuntimeEnvironmentId === target.environmentId &&
    state.activeModal === 'none' &&
    state.activeWorktreeId === target.worktreeId &&
    page?.worktreeId === target.worktreeId &&
    page.browserRuntimeEnvironmentId === target.environmentId &&
    workspace?.activePageId === target.page &&
    state.activeBrowserTabIdByWorktree[target.worktreeId] === workspace.id &&
    handle?.environmentId === target.environmentId &&
    handle.remotePageId === target.remotePageId &&
    handle.staged &&
    handle.stagedClientHosted &&
    !handle.placement &&
    !handle.restoredFromSession &&
    !handle.restoredClientHosted
  )
}
