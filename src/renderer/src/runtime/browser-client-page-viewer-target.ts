import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { matchesBrowserClientPageCommandTarget } from './browser-client-page-command-target'
import type { RuntimeBrowserClientPlacement } from '../../../shared/runtime-browser-placement'
import type { BrowserClientPageTarget } from '../../../shared/rpc-contract/browser-client-page-target'
export function isBrowserClientPageViewerTargetCurrent(
  target: BrowserClientPageTarget & { worktreeId: string; page: string; environmentId: string },
  placement?: RuntimeBrowserClientPlacement | null
): boolean {
  const state = useAppStore.getState()
  const page = findPage(state.browserPagesByWorkspace, target.page)
  const workspace = state.browserTabsByWorktree[target.worktreeId]?.find(
    (workspace) => workspace.id === page?.workspaceId
  )
  return Boolean(
    state.persistedUIReady &&
    state.settings?.activeRuntimeEnvironmentId === target.environmentId &&
    state.activeModal === 'none' &&
    state.activeWorktreeId === target.worktreeId &&
    page?.worktreeId === target.worktreeId &&
    page.browserRuntimeEnvironmentId === target.environmentId &&
    workspace?.activePageId === target.page &&
    state.activeBrowserTabIdByWorktree[target.worktreeId] === workspace.id &&
    matchesBrowserClientPageCommandTarget(
      state.remoteBrowserPageHandlesByPageId[target.page],
      target.environmentId,
      target,
      placement
    )
  )
}
