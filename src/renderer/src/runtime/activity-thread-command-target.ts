import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getWorktreeExecutionHostId,
  getSettingsFocusedExecutionHostId
} from '../../../shared/execution-host'
import type { ActivityViewerSurface } from '../../../shared/rpc-contract/activity-viewer-params'
import {
  readActivityGroupCollapseControl,
  readActivityNavigationControl,
  readActivityViewerView
} from './activity-viewer-view'
import { readActivityScope, sameActivityScope } from './activity-scope-preferences'
import { isActivityDestinationVisible } from './activity-workspace-destination'

export function captureActivityThreadCommandTarget(
  surface: ActivityViewerSurface,
  paneKey: string
) {
  const initial = useAppStore.getState()
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const scope = readActivityScope(initial)
  const view = readActivityViewerView(surface)
  const root = document.querySelector<HTMLElement>(`[data-activity-viewer="${surface}"]`)
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
    (surface === 'activity-page'
      ? initial.activeView !== 'activity'
      : !initial.sidebarOpen || initial.sidebarBody !== 'agents')
  ) {
    throw new Error('activity_surface_unavailable')
  }
  const control = readActivityNavigationControl(surface)
  const thread = control?.visibleThreads.find((candidate) => candidate.paneKey === paneKey)
  if (!control || !thread) {
    throw new Error('activity_thread_unavailable')
  }
  const queryRevision = readActivityGroupCollapseControl(surface)?.queryRevision
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
      (surface === 'sidebar-agents' && (!state.sidebarOpen || state.sidebarBody !== 'agents'))
    ) {
      superseded = true
    }
  }
  const stillOwned = (): boolean => {
    const current = readActivityViewerView(surface)
    const currentControl = readActivityNavigationControl(surface)
    const currentThread = currentControl?.visibleThreads.find(
      (candidate) => candidate.paneKey === paneKey
    )
    return (
      !superseded &&
      sameRuntime() &&
      current?.querySettled === true &&
      current.runtimeContextKey === runtime &&
      current.query === view.query &&
      readActivityGroupCollapseControl(surface)?.queryRevision === queryRevision &&
      current.groupBy === view.groupBy &&
      current.readFilter === view.readFilter &&
      current.compact === view.compact &&
      current.showChildAgents === view.showChildAgents &&
      sameActivityScope(current.scope, scope) &&
      document.querySelector(`[data-activity-viewer="${surface}"]`) === root &&
      currentThread !== undefined &&
      currentThread.worktree.id === workspaceId &&
      currentThread.repo?.id === repoId &&
      getWorktreeExecutionHostId(
        currentThread.worktree,
        currentThread.repo ?? undefined,
        getSettingsFocusedExecutionHostId(useAppStore.getState().settings)
      ) === executionHostId &&
      currentControl !== null
    )
  }
  const stillExpected = (): boolean => stillOwned() && isActivityDestinationVisible(root)
  const readCurrent = () => {
    const currentControl = readActivityNavigationControl(surface)
    const currentThread = currentControl?.visibleThreads.find(
      (candidate) => candidate.paneKey === paneKey
    )
    return currentControl && currentThread
      ? { control: currentControl, thread: currentThread }
      : null
  }
  return {
    initial,
    root,
    view,
    thread,
    control,
    workspaceId,
    executionHostId,
    sameRuntime,
    observe,
    stillExpected,
    stillOwned,
    readCurrent
  }
}
