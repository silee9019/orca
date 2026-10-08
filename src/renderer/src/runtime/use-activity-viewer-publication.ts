import { useLayoutEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getSettingsFocusedExecutionHostId,
  getWorktreeExecutionHostId
} from '../../../shared/execution-host'
import type { ActivityViewerSurface } from '../../../shared/rpc-contract/activity-viewer-params'
import type { ActivityViewerSnapshot } from '../../../shared/activity-viewer-command'
import {
  getActivityVirtualItemKey,
  type ActivityVirtualItemDescriptor
} from '@/components/activity/activity-thread-virtual-items'
import { publishActivityViewerView } from './activity-viewer-view'

export function useActivityViewerPublication(
  surface: ActivityViewerSurface | undefined,
  rows: readonly ActivityVirtualItemDescriptor[],
  preferences: Pick<
    ActivityViewerSnapshot,
    | 'groupBy'
    | 'readFilter'
    | 'compact'
    | 'showChildAgents'
    | 'querySettled'
    | 'query'
    | 'selectedPaneKey'
  >
): void {
  const context = useAppStore(
    useShallow((state) => ({
      runtimeContextKey: getProviderRuntimeContextKey(state.settings),
      defaultHostId: getSettingsFocusedExecutionHostId(state.settings)
    }))
  )
  const { groupBy, readFilter, compact, showChildAgents, querySettled, query, selectedPaneKey } =
    preferences
  useLayoutEffect(() => {
    if (!surface) {
      return
    }
    publishActivityViewerView(surface, {
      surface,
      runtimeContextKey: context.runtimeContextKey,
      groupBy,
      readFilter,
      compact,
      showChildAgents,
      querySettled,
      query,
      selectedPaneKey,
      densityMeasured: false,
      renderedRows: [],
      logicalRows: rows.map((row) => ({
        key: getActivityVirtualItemKey(row),
        kind: row.type,
        workspaceId: row.type === 'thread' ? row.thread.worktree.id : null,
        hostId:
          row.type === 'thread'
            ? getWorktreeExecutionHostId(
                row.thread.worktree,
                row.thread.repo ?? undefined,
                context.defaultHostId
              )
            : null
      }))
    })
    return () => publishActivityViewerView(surface, null)
  }, [
    surface,
    rows,
    context,
    groupBy,
    readFilter,
    compact,
    showChildAgents,
    querySettled,
    query,
    selectedPaneKey
  ])
}
