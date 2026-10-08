import {
  getWorktreeExecutionHostId,
  getSettingsFocusedExecutionHostId
} from '../../../shared/execution-host'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getActivityThreadCopyTargets,
  writeActivityThreadCopyTarget
} from '@/components/activity/activity-thread-copy'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { withTimeout } from '../../../shared/promise-timeout-fallback'
import {
  readActivityGroupCollapseControl,
  readActivityNavigationControl,
  readActivityViewerView
} from './activity-viewer-view'
import { readActivityScope, sameActivityScope } from './activity-scope-preferences'
import { isActivityDestinationVisible } from './activity-workspace-destination'

export async function applyActivityThreadCopyRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'copy' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const initial = useAppStore.getState()
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const scope = readActivityScope(initial)
  const view = readActivityViewerView(command.surface)
  const root = document.querySelector<HTMLElement>(`[data-activity-viewer="${command.surface}"]`)
  if (
    !view ||
    !view.querySettled ||
    view.groupBy !== initial.agentsGroupBy ||
    view.readFilter !== initial.agentsReadFilter ||
    view.compact !== initial.agentsCompactMode ||
    view.showChildAgents !== initial.agentsShowChildAgents ||
    view.runtimeContextKey !== runtime ||
    !sameActivityScope(view.scope, scope) ||
    !root ||
    !isActivityDestinationVisible(root) ||
    (command.surface === 'activity-page'
      ? initial.activeView !== 'activity'
      : !initial.sidebarOpen || initial.sidebarBody !== 'agents')
  ) {
    throw new Error('activity_surface_unavailable')
  }
  const control = readActivityNavigationControl(command.surface)
  const thread = control?.visibleThreads.find((candidate) => candidate.paneKey === command.paneKey)
  if (!control || !thread) {
    throw new Error('activity_thread_unavailable')
  }
  const target = getActivityThreadCopyTargets(thread, control.canJump(thread)).find(
    (candidate) => candidate.key === command.kind
  )
  if (!target) {
    throw new Error('activity_copy_unavailable')
  }
  const queryRevision = readActivityGroupCollapseControl(command.surface)?.queryRevision
  if (queryRevision === undefined) {
    throw new Error('activity_surface_unavailable')
  }
  const workspaceId = thread.worktree.id
  const repoId = thread.repo?.id
  const executionHostId = getWorktreeExecutionHostId(
    thread.worktree,
    thread.repo ?? undefined,
    getSettingsFocusedExecutionHostId(initial.settings)
  )
  const value = target.value
  const initialView = initial.activeView
  const initialWorkspace = initial.activeWorktreeId
  let superseded = false
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const observe = (): void => {
    const state = useAppStore.getState()
    if (
      !sameRuntime() ||
      state.activeView !== initialView ||
      state.activeWorktreeId !== initialWorkspace ||
      state.agentsGroupBy !== view.groupBy ||
      state.agentsReadFilter !== view.readFilter ||
      state.agentsCompactMode !== view.compact ||
      state.agentsShowChildAgents !== view.showChildAgents ||
      !sameActivityScope(readActivityScope(state), scope) ||
      (command.surface === 'sidebar-agents' &&
        (!state.sidebarOpen || state.sidebarBody !== 'agents'))
    ) {
      superseded = true
    }
  }
  const stillExpected = (): boolean => {
    const current = readActivityViewerView(command.surface)
    const currentControl = readActivityNavigationControl(command.surface)
    const currentThread = currentControl?.visibleThreads.find(
      (candidate) => candidate.paneKey === command.paneKey
    )
    return (
      !superseded &&
      sameRuntime() &&
      current?.querySettled === true &&
      current.runtimeContextKey === runtime &&
      current.query === view.query &&
      readActivityGroupCollapseControl(command.surface)?.queryRevision === queryRevision &&
      current.groupBy === view.groupBy &&
      current.readFilter === view.readFilter &&
      current.compact === view.compact &&
      current.showChildAgents === view.showChildAgents &&
      sameActivityScope(current.scope, scope) &&
      document.querySelector(`[data-activity-viewer="${command.surface}"]`) === root &&
      isActivityDestinationVisible(root) &&
      currentThread !== undefined &&
      currentThread.worktree.id === workspaceId &&
      currentThread.repo?.id === repoId &&
      getWorktreeExecutionHostId(
        currentThread.worktree,
        currentThread.repo ?? undefined,
        getSettingsFocusedExecutionHostId(useAppStore.getState().settings)
      ) === executionHostId &&
      currentControl !== null &&
      getActivityThreadCopyTargets(currentThread, currentControl.canJump(currentThread)).some(
        (candidate) => candidate.key === command.kind && candidate.value === value
      )
    )
  }
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    const remaining = (): number => Math.max(0, Math.min(5000, request.expiresAt - Date.now()))
    const written = await withTimeout(
      writeActivityThreadCopyTarget(target).then(() => true),
      remaining(),
      false
    )
    observe()
    const verified =
      written &&
      Date.now() < request.expiresAt &&
      stillExpected() &&
      (await withTimeout(
        window.api.ui.readClipboardText().then((text) => text === value),
        remaining(),
        false
      ))
    observe()
    const available = stillExpected()
    return {
      viewer: 'host',
      surface: command.surface,
      dispatched: true,
      applied: Date.now() < request.expiresAt && available && verified,
      persisted: null,
      writeOutcome: 'not_requested',
      groupBy: initial.agentsGroupBy,
      readFilter: initial.agentsReadFilter,
      compact: initial.agentsCompactMode,
      showChildAgents: initial.agentsShowChildAgents,
      rendered: sameRuntime() ? readActivityViewerView(command.surface) : null,
      copyAction: {
        paneKey: command.paneKey,
        kind: command.kind,
        writeAcknowledged: written,
        verified
      },
      ...(!sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !available
          ? { reason: 'viewer_surface_superseded' as const }
          : !verified || Date.now() >= request.expiresAt
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    unsubscribe()
  }
}
