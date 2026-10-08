import { useLayoutEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { getRowHostId, type HostSectionRow } from '@/components/sidebar/host-section-rows'
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
      rows: workspaceListViewerRows(sectionRows, defaultHostId),
      empty: false
    })
    return () => publishWorkspaceListViewerView(null)
  }, [preferences, sectionRows])
}
