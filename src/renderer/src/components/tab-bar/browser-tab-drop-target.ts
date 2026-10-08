import { useAppStore } from '@/store'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { isWebRuntimeSessionActive } from '@/runtime/web-runtime-session-environment'
import type {
  BrowserTabDropTarget,
  BrowserTabDropDestination
} from '../../../../shared/rpc-contract/browser-tab-drop-params'
import type { TabDragItemData } from '../tab-group/tab-drag-data'
import type { ResolvedTabDropTarget } from '../tab-group/tab-drag-drop-commit'

export function readBrowserTabDropSource(
  target: BrowserTabDropTarget,
  requireSourceGroup = true
): TabDragItemData {
  const state = useAppStore.getState()
  const tab = state.unifiedTabsByWorktree[target.worktree]?.find(
    (item) => item.id === target.unifiedTab
  )
  const workspace = state.browserTabsByWorktree[target.worktree]?.find(
    (item) => item.id === target.workspace
  )
  const group = state.groupsByWorktree[target.worktree]?.find((item) => item.id === tab?.groupId)
  const environmentId = getRuntimeEnvironmentIdForWorktree(state, target.worktree)
  if (
    !state.persistedUIReady ||
    !state.settings ||
    state.activeModal !== 'none' ||
    state.activeWorktreeId !== target.worktree ||
    !workspace ||
    !tab ||
    tab.entityId !== target.workspace ||
    tab.contentType !== 'browser' ||
    !group?.tabOrder.includes(tab.id) ||
    (requireSourceGroup && tab.groupId !== target.group) ||
    environmentId !== target.environmentId ||
    (environmentId !== null && !isWebRuntimeSessionActive(environmentId)) ||
    (environmentId === null && tab.executionHostId && tab.executionHostId !== 'local')
  ) {
    throw new Error('browser_tab_drop_target_unavailable')
  }
  return {
    kind: 'tab',
    worktreeId: target.worktree,
    groupId: tab.groupId,
    unifiedTabId: tab.id,
    visibleTabId: target.workspace,
    tabType: 'browser',
    label: tab.label
  }
}
export function resolveBrowserTabDropDestination(
  target: BrowserTabDropTarget,
  destination: BrowserTabDropDestination
): ResolvedTabDropTarget {
  const state = useAppStore.getState()
  const group = state.groupsByWorktree[target.worktree]?.find(
    (item) => item.id === destination.group
  )
  if (!group) {
    throw new Error('browser_tab_drop_destination_unavailable')
  }
  if (destination.kind !== 'tab') {
    return destination.kind === 'pane'
      ? { kind: 'pane', groupId: group.id }
      : { kind: 'split', groupId: group.id, direction: destination.direction }
  }
  const tab = state.unifiedTabsByWorktree[target.worktree]?.find(
    (item) => item.id === destination.tab
  )
  if (!tab || tab.groupId !== group.id || !group.tabOrder.includes(tab.id)) {
    throw new Error('browser_tab_drop_destination_unavailable')
  }
  return {
    kind: 'tab',
    side: destination.side,
    tab: {
      kind: 'tab',
      worktreeId: target.worktree,
      groupId: group.id,
      unifiedTabId: tab.id,
      visibleTabId: tab.entityId,
      tabType:
        tab.contentType === 'diff' ||
        tab.contentType === 'conflict-review' ||
        tab.contentType === 'check-details'
          ? 'editor'
          : tab.contentType,
      label: tab.label
    }
  }
}
