import { useAppStore } from '@/store'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getSettingsFocusedExecutionHostId,
  getWorktreeExecutionHostId
} from '../../../shared/execution-host'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { readActivityNavigationControl, readActivityViewerView } from './activity-viewer-view'
import { readActivityWorkspaceDestination } from './activity-workspace-destination'

export async function applyActivityJumpRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'jump' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const initial = useAppStore.getState()
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const view = readActivityViewerView(command.surface)
  if (!view || view.runtimeContextKey !== runtime || !view.querySettled) {
    throw new Error('activity_surface_unavailable')
  }
  const control = readActivityNavigationControl(command.surface)
  if (!control) {
    throw new Error('activity_navigation_unavailable')
  }
  const thread = control.visibleThreads.find((candidate) => candidate.paneKey === command.paneKey)
  if (!thread) {
    throw new Error('activity_thread_unavailable')
  }
  if (!control.canJump(thread)) {
    throw new Error('activity_workspace_unavailable')
  }
  const workspaceId = thread.worktree.id
  const executionHostId = getWorktreeExecutionHostId(
    thread.worktree,
    thread.repo ?? undefined,
    getSettingsFocusedExecutionHostId(initial.settings)
  )
  let sawDestinationWorkspace = false
  let sawDestinationOwner = false
  let dispatched = false
  let superseded = false
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const workspaceSelected = (): boolean => {
    const state = useAppStore.getState()
    return state.activeView === 'terminal' && state.activeWorktreeId === workspaceId
  }
  const destinationSelected = (): boolean =>
    workspaceSelected() &&
    getResolvedExecutionHostIdForWorktree(useAppStore.getState(), workspaceId) === executionHostId
  const observeNavigation = (): void => {
    if (!workspaceSelected()) {
      if (sawDestinationWorkspace) {
        superseded = true
      }
      return
    }
    sawDestinationWorkspace = true
    const owner = getResolvedExecutionHostIdForWorktree(useAppStore.getState(), workspaceId)
    if (owner === executionHostId) {
      sawDestinationOwner = true
    } else if (sawDestinationOwner || (dispatched && owner !== null)) {
      superseded = true
    }
  }
  const unsubscribe = useAppStore.subscribe(observeNavigation)
  try {
    const accepted = control.jump(thread)
    dispatched = true
    observeNavigation()
    const reachesDestination = (): boolean =>
      accepted === true &&
      sameRuntime() &&
      !superseded &&
      destinationSelected() &&
      readActivityWorkspaceDestination(workspaceId, executionHostId)
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    while (
      accepted === true &&
      sameRuntime() &&
      !superseded &&
      !reachesDestination() &&
      Date.now() < deadline
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const applied = Date.now() < request.expiresAt && reachesDestination()
    return {
      viewer: 'host',
      surface: command.surface,
      dispatched: true,
      applied,
      persisted: null,
      writeOutcome: 'not_requested',
      groupBy: initial.agentsGroupBy,
      readFilter: initial.agentsReadFilter,
      compact: initial.agentsCompactMode,
      showChildAgents: initial.agentsShowChildAgents,
      rendered: sameRuntime() ? readActivityViewerView(command.surface) : null,
      navigationAction: {
        operation: 'jump',
        paneKey: command.paneKey,
        workspaceId,
        executionHostId,
        requestAccepted: typeof accepted === 'boolean' ? accepted : null,
        reached: applied ? 'workspace' : 'none',
        remoteAck: 'unknown'
      },
      ...(!sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : superseded
          ? { reason: 'viewer_surface_superseded' as const }
          : !applied
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    unsubscribe()
  }
}
