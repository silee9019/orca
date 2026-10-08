import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { shouldShowWorktreeCreationSurface } from '@/lib/worktree-creation-surface'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import { readActivityViewerView } from './activity-viewer-view'
import {
  isActivityDestinationVisible,
  readActivityWorkspaceDestination
} from './activity-workspace-destination'

export async function applyActivityPageCloseRequest(
  request: ActivityViewerRequest
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const initial = useAppStore.getState()
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const source = document.querySelector<HTMLElement>('[data-activity-viewer="activity-page"]')
  const button = document.querySelector('[data-activity-page-close]')
  const view = readActivityViewerView('activity-page')
  if (
    !view ||
    view.runtimeContextKey !== runtime ||
    initial.activeView !== 'activity' ||
    !source ||
    !isActivityDestinationVisible(source) ||
    !(button instanceof HTMLButtonElement) ||
    button.disabled ||
    button.getAttribute('aria-disabled') === 'true' ||
    !isActivityDestinationVisible(button)
  ) {
    throw new Error('activity_close_unavailable')
  }
  const requestedView = initial.previousViewBeforeActivity
  const workspaceId = initial.activeWorktreeId
  const creationId = initial.activePendingCreationId
  const hasCreation =
    creationId !== null && initial.pendingWorktreeCreations[creationId] !== undefined
  const creation = shouldShowWorktreeCreationSurface({
    activeView: requestedView,
    activePendingCreationId: creationId,
    hasActivePendingCreation: hasCreation
  })
  const host = workspaceId ? getResolvedExecutionHostIdForWorktree(initial, workspaceId) : null
  let arrived = false
  let superseded = false
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const observe = (): void => {
    const state = useAppStore.getState()
    if (!sameRuntime() || state.previousViewBeforeActivity !== requestedView) {
      superseded = true
    }
    if (state.activeView === requestedView) {
      arrived = true
    } else if (arrived || state.activeView !== 'activity') {
      superseded = true
    }
    if (
      requestedView === 'terminal' &&
      (state.activeWorktreeId !== workspaceId ||
        state.activePendingCreationId !== creationId ||
        (creationId !== null && state.pendingWorktreeCreations[creationId] !== undefined) !==
          hasCreation ||
        (workspaceId !== null &&
          getResolvedExecutionHostIdForWorktree(state, workspaceId) !== host))
    ) {
      superseded = true
    }
  }
  const matches = (): boolean => {
    const state = useAppStore.getState()
    if (superseded || !sameRuntime() || state.activeView !== requestedView) {
      return false
    }
    const page = [...document.querySelectorAll<HTMLElement>('[data-rendered-active-page]')].find(
      (element) =>
        element.dataset.renderedActivePage === requestedView &&
        isActivityDestinationVisible(element)
    )
    if (!page || document.querySelector('[data-activity-viewer="activity-page"]')) {
      return false
    }
    if (requestedView !== 'terminal') {
      return true
    }
    if (creation) {
      return false
    }
    return (
      workspaceId === null || (host !== null && readActivityWorkspaceDestination(workspaceId, host))
    )
  }
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    button.click()
    observe()
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    while (!superseded && !matches() && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const applied = Date.now() < request.expiresAt && matches()
    return {
      viewer: 'host',
      surface: 'activity-page',
      dispatched: true,
      applied,
      persisted: null,
      writeOutcome: 'not_requested',
      groupBy: initial.agentsGroupBy,
      readFilter: initial.agentsReadFilter,
      compact: initial.agentsCompactMode,
      showChildAgents: initial.agentsShowChildAgents,
      rendered: sameRuntime() ? readActivityViewerView('activity-page') : null,
      pageAction: { requestedView, reachedView: applied ? requestedView : null },
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
