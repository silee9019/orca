import { useLayoutEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getRowHostId,
  type HostHeaderRow,
  type HostSectionRow
} from '@/components/sidebar/host-section-rows'
import type {
  GroupHeaderRow,
  WorktreeRow
} from '@/components/sidebar/worktree-list/grouping/row-types'
import { getSectionHeaderCollapseKey } from '@/components/sidebar/worktree-list/rows/section-header-collapse-key'
import {
  getSettingsFocusedExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import type { WorkspaceListViewerSnapshot } from '../../../shared/workspace-list-viewer-command'
import { publishWorkspaceListViewerView } from './workspace-list-viewer-view'

export function workspaceListViewerRows(
  rows: readonly HostSectionRow[],
  defaultHostId: ExecutionHostId
): WorkspaceListViewerSnapshot['rows'] {
  return rows.map((row) => ({
    type: row.type,
    key: row.type === 'item' ? row.rowKey : row.key,
    workspaceId:
      row.type === 'item'
        ? row.worktree.id
        : row.type === 'folder-workspace'
          ? row.folderWorkspace.id
          : null,
    hostId: row.type === 'host-header' ? row.hostId : getRowHostId(row, defaultHostId)
  }))
}

type CollapsibleRowSource =
  | GroupHeaderRow
  | Pick<HostHeaderRow, 'type' | 'key'>
  | Pick<WorktreeRow, 'type' | 'lineageGroupKey' | 'lineageChildCount'>
  | { type: Exclude<HostSectionRow['type'], 'host-header' | 'header' | 'item'> }

// Why: a header click toggles its key whether or not it draws a chevron, so every header is collapsible.
export function workspaceListCollapsibleKeys(rows: readonly CollapsibleRowSource[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.type === 'host-header') {
      keys.add(row.key)
    } else if (row.type === 'header') {
      keys.add(getSectionHeaderCollapseKey(row))
    } else if (row.type === 'item' && row.lineageGroupKey && row.lineageChildCount > 0) {
      keys.add(row.lineageGroupKey)
    }
  }
  return [...keys]
}

export function useWorkspaceListViewerPublication(sectionRows: readonly HostSectionRow[]): void {
  const preferences = useAppStore(
    useShallow((state) => ({
      groupBy: state.groupBy,
      sortBy: state.sortBy,
      projectOrderBy: state.projectOrderBy,
      collapsedGroups: state.collapsedGroups,
      runtimeContextKey: getProviderRuntimeContextKey(state.settings),
      defaultHostId: getSettingsFocusedExecutionHostId(state.settings)
    }))
  )
  useLayoutEffect(() => {
    const { defaultHostId, ...snapshot } = preferences
    publishWorkspaceListViewerView({
      ...snapshot,
      collapsedGroups: [...preferences.collapsedGroups],
      collapsibleKeys: workspaceListCollapsibleKeys(sectionRows),
      rows: workspaceListViewerRows(sectionRows, defaultHostId),
      empty: false
    })
    return () => publishWorkspaceListViewerView(null)
  }, [preferences, sectionRows])
}
