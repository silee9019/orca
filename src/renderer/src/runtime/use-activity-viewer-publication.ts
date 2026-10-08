import type {
  AgentPaneThread,
  ActivityThreadGroup
} from '@/components/activity/activity-thread-types'
import { readActivityScope } from './activity-scope-preferences'
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
import { publishActivityViewerView, type ActivityThreadReadCallbacks } from './activity-viewer-view'

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
  > & {
    markAllRead?: { run?: () => void; hasUnreadThreads: boolean }
    navigation?: {
      jump: (thread: AgentPaneThread) => boolean | void
      canJump: (thread: AgentPaneThread) => boolean
    }
    threadReads?: ActivityThreadReadCallbacks
    completed?: {
      run?: () => void
      hasCompletedThreads?: boolean
      groups: readonly ActivityThreadGroup[]
    }
  }
): void {
  const context = useAppStore(
    useShallow((state) => ({
      runtimeContextKey: getProviderRuntimeContextKey(state.settings),
      defaultHostId: getSettingsFocusedExecutionHostId(state.settings),
      agentsVisibleHostIds: state.agentsVisibleHostIds,
      agentsFilterRepoIds: state.agentsFilterRepoIds,
      agentsHideWorkspacesFromOtherDevices: state.agentsHideWorkspacesFromOtherDevices,
      agentsHideAutomationGeneratedWorkspaces: state.agentsHideAutomationGeneratedWorkspaces,
      agentsHideCliCreatedWorkspaces: state.agentsHideCliCreatedWorkspaces
    }))
  )
  const { groupBy, readFilter, compact, showChildAgents, querySettled, query, selectedPaneKey } =
    preferences
  const markAllRead = preferences.markAllRead?.run
  const hasUnreadThreads = preferences.markAllRead?.hasUnreadThreads
  const { allThreads, markRead, markUnread, markManyRead, markManyUnread, canMarkUnread } =
    preferences.threadReads ?? {}
  const navigationJump = preferences.navigation?.jump
  const navigationCanJump = preferences.navigation?.canJump
  const completedRun = preferences.completed?.run
  const completedThreads = preferences.completed?.groups
  const hasCompletedThreads = preferences.completed?.hasCompletedThreads
  useLayoutEffect(() => {
    if (!surface) {
      return
    }
    publishActivityViewerView(
      surface,
      {
        surface,
        runtimeContextKey: context.runtimeContextKey,
        groupBy,
        readFilter,
        compact,
        showChildAgents,
        querySettled,
        query,
        scope: readActivityScope(context),
        selectedPaneKey,
        hasUnreadThreads,
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
      },
      {
        markAllRead,
        navigation:
          navigationJump && navigationCanJump
            ? {
                jump: navigationJump,
                canJump: navigationCanJump,
                visibleThreads: rows.flatMap((row) => (row.type === 'thread' ? [row.thread] : []))
              }
            : undefined,
        completed:
          completedRun && completedThreads && allThreads && hasCompletedThreads !== undefined
            ? {
                run: completedRun,
                visibleThreads: completedThreads.flatMap((group) => group.threads),
                allThreads,
                hasCompletedThreads
              }
            : undefined,
        threadReads:
          allThreads && markRead && markUnread && markManyRead && markManyUnread && canMarkUnread
            ? {
                allThreads,
                markRead,
                markUnread,
                markManyRead,
                markManyUnread,
                canMarkUnread,
                visibleThreads: rows.flatMap((row) => (row.type === 'thread' ? [row.thread] : []))
              }
            : undefined
      }
    )
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
    selectedPaneKey,
    hasUnreadThreads,
    markAllRead,
    allThreads,
    markRead,
    markUnread,
    markManyRead,
    markManyUnread,
    canMarkUnread,
    navigationJump,
    navigationCanJump,
    completedRun,
    completedThreads,
    hasCompletedThreads
  ])
}
