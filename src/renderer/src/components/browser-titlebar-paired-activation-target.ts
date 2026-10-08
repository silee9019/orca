import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { useAppStore } from '@/store'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { getBrowserWorkspaceRemoteOwnership } from '@/runtime/remote-browser-tab-ownership'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { resolveHostSessionTabIdForWebSessionTab } from '@/runtime/web-session-tabs-sync/tracking-mappings'
import { sameRuntimeBrowserPlacement } from '../../../shared/runtime-browser-placement'
import type { BrowserTitlebarPairedActivationTarget } from '../../../shared/rpc-contract/browser-titlebar-paired-activation-params'
export function isBrowserTitlebarPairedActivationTargetCurrent(
  target: BrowserTitlebarPairedActivationTarget
): boolean {
  const state = useAppStore.getState()
  const workspace = state.browserTabsByWorktree[target.worktree]?.find(
    (tab) => tab.id === target.workspace
  )
  const page = state.browserPagesByWorkspace[target.workspace]?.find(
    (page) => page.id === target.page
  )
  const item = state.unifiedTabsByWorktree[target.worktree]?.find(
    (tab) => tab.id === target.unifiedTab
  )
  const group = state.groupsByWorktree[target.worktree]?.find((group) => group.id === target.group)
  const handle = state.remoteBrowserPageHandlesByPageId[target.page]
  const ownership = getBrowserWorkspaceRemoteOwnership(state, target.workspace)
  const hostTabId = resolveHostSessionTabIdForWebSessionTab(state, {
    environmentId: target.environmentId,
    worktreeId: target.worktree,
    tabId: target.workspace
  })
  return Boolean(
    state.persistedUIReady &&
    state.activeView === 'terminal' &&
    state.activeModal === 'none' &&
    state.activeWorktreeId === target.worktree &&
    state.activeGroupIdByWorktree[target.worktree] === target.group &&
    getRuntimeEnvironmentIdForWorktree(state, target.worktree) === target.environmentId &&
    getResolvedExecutionHostIdForWorktree(state, target.worktree) === target.executionHostId &&
    target.executionHostId === `runtime:${target.environmentId}` &&
    getRuntimeEnvironmentRevision(target.environmentId) === target.pairingRevision &&
    workspace?.worktreeId === target.worktree &&
    workspace.activePageId === target.page &&
    item?.contentType === 'browser' &&
    item.entityId === target.workspace &&
    item.groupId === target.group &&
    group?.tabOrder.includes(target.unifiedTab) &&
    page &&
    !page.docLocation &&
    page.browserRuntimeEnvironmentId === target.environmentId &&
    ownership.kind === 'exact' &&
    ownership.environmentId === target.environmentId &&
    handle?.environmentId === target.environmentId &&
    handle.remotePageId === target.remotePageId &&
    handle.placement &&
    sameRuntimeBrowserPlacement(handle.placement, target.placement) &&
    !handle.staged &&
    !handle.stagedClientHosted &&
    !handle.restoredFromSession &&
    !handle.restoredClientHosted &&
    hostTabId === target.hostTabId
  )
}
