import type { RefObject } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useAppStore } from '../../store'
import { mirrorWebRuntimeTabMove } from '../tab-bar/web-runtime-tab-move-mirror'
import { resolveTabInsertion } from './tab-insertion'
import { resolveSourceGroupRestoreOnDrop } from './tab-drag-preview-target'
import { getDragPointer } from './tab-drag-pointer'
import {
  resolveActivePaneColumnSplitTarget,
  type TabGroupPanelGeometrySnapshot
} from './tab-group-panel-split-target'
import { isPaneDropData, isTabDragData, type TabDragItemData } from './tab-drag-data'

type AppState = ReturnType<typeof useAppStore.getState>
type FinishTabDrop = (restoreSnapshot: boolean, activeData?: TabDragItemData) => void

export type ResolvedTabDropTarget =
  | { kind: 'split'; groupId: string; direction: 'left' | 'right' | 'up' | 'down' }
  | { kind: 'tab'; tab: TabDragItemData; side: 'left' | 'right' }
  | { kind: 'pane'; groupId: string }

type TabDropActions = {
  worktreeId: string
  dropUnifiedTab: AppState['dropUnifiedTab']
  reorderUnifiedTabs: AppState['reorderUnifiedTabs']
  finishDrag: FinishTabDrop
  observeMirror?: (completion: Promise<boolean>) => void
}

export function commitTabDragDrop({
  event,
  dragGeometryRef,
  ...actions
}: TabDropActions & {
  event: DragEndEvent
  dragGeometryRef: RefObject<TabGroupPanelGeometrySnapshot | null>
}): void {
  const activeData = event.active.data.current
  const overData = event.over?.data.current
  const { worktreeId, finishDrag } = actions
  if (!isTabDragData(activeData) || activeData.worktreeId !== worktreeId) {
    finishDrag(true)
    return
  }
  const state = useAppStore.getState()
  const paneColumnSplit = resolveActivePaneColumnSplitTarget({
    event,
    groupsByWorktree: state.groupsByWorktree,
    layoutByWorktree: state.layoutByWorktree,
    worktreeId,
    getDragPointer,
    geometry: dragGeometryRef.current
  })
  if (paneColumnSplit) {
    commitResolvedTabDrop(
      activeData,
      {
        kind: 'split',
        groupId: paneColumnSplit.groupId,
        direction: paneColumnSplit.zone
      },
      actions
    )
    return
  }
  if (event.over && isTabDragData(overData)) {
    const insertion = resolveTabInsertion(event, isTabDragData, getDragPointer)
    if (insertion) {
      commitResolvedTabDrop(
        activeData,
        { kind: 'tab', tab: overData, side: insertion.side },
        actions
      )
      return
    }
  }
  if (event.over && isPaneDropData(overData)) {
    commitResolvedTabDrop(activeData, { kind: 'pane', groupId: overData.groupId }, actions)
    return
  }
  finishDrag(true)
}

export function commitResolvedTabDrop(
  activeData: TabDragItemData,
  target: ResolvedTabDropTarget,
  { worktreeId, dropUnifiedTab, reorderUnifiedTabs, finishDrag, observeMirror }: TabDropActions
): boolean {
  let moved = false
  const targetGroupId = target.kind === 'tab' ? target.tab.groupId : target.groupId
  if (activeData.worktreeId !== worktreeId) {
    finishDrag(true)
    return false
  }
  if (target.kind === 'split') {
    moved = dropUnifiedTab(activeData.unifiedTabId, {
      groupId: target.groupId,
      splitDirection: target.direction
    })
    if (moved) {
      mirrorWebRuntimeTabMove(
        {
          kind: 'split',
          worktreeId,
          tabId: activeData.unifiedTabId,
          targetGroupId,
          splitDirection: target.direction
        },
        observeMirror
      )
    }
  } else if (target.kind === 'tab') {
    const targetGroup = (useAppStore.getState().groupsByWorktree[worktreeId] ?? []).find(
      (group) => group.id === targetGroupId
    )
    if (!targetGroup || activeData.unifiedTabId === target.tab.unifiedTabId) {
      finishDrag(true)
      return false
    }
    const overIndex = targetGroup.tabOrder.indexOf(target.tab.unifiedTabId)
    const rawInsertIndex = overIndex + (target.side === 'right' ? 1 : 0)
    if (activeData.groupId === targetGroupId) {
      const oldIndex = targetGroup.tabOrder.indexOf(activeData.unifiedTabId)
      const nextIndex = oldIndex < rawInsertIndex ? rawInsertIndex - 1 : rawInsertIndex
      if (oldIndex !== -1 && oldIndex !== nextIndex) {
        const nextOrder = targetGroup.tabOrder.filter((id) => id !== activeData.unifiedTabId)
        nextOrder.splice(nextIndex, 0, activeData.unifiedTabId)
        reorderUnifiedTabs(targetGroupId, nextOrder)
        mirrorWebRuntimeTabMove(
          {
            kind: 'reorder',
            worktreeId,
            tabId: activeData.unifiedTabId,
            targetGroupId,
            tabOrder: nextOrder
          },
          observeMirror
        )
        moved = true
      }
    } else {
      const index = overIndex === -1 ? targetGroup.tabOrder.length : rawInsertIndex
      moved = dropUnifiedTab(activeData.unifiedTabId, { groupId: targetGroupId, index })
      if (moved) {
        mirrorWebRuntimeTabMove(
          {
            kind: 'move-to-group',
            worktreeId,
            tabId: activeData.unifiedTabId,
            targetGroupId,
            index
          },
          observeMirror
        )
      }
    }
  } else if (activeData.groupId !== targetGroupId) {
    moved = dropUnifiedTab(activeData.unifiedTabId, { groupId: targetGroupId })
    if (moved) {
      mirrorWebRuntimeTabMove(
        {
          kind: 'move-to-group',
          worktreeId,
          tabId: activeData.unifiedTabId,
          targetGroupId
        },
        observeMirror
      )
    }
  }
  const restoreSnapshot = !moved || (target.kind === 'tab' && activeData.groupId === targetGroupId)
  finishDrag(
    restoreSnapshot,
    resolveSourceGroupRestoreOnDrop(activeData, targetGroupId, restoreSnapshot)
  )
  return moved
}
