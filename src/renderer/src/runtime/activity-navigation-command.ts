import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import {
  isActivitySelectionTargetSelected,
  readActivitySelectionDestination
} from './activity-selection-destination'
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

export async function applyActivityNavigationRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'jump' | 'select' }>
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
  if (command.operation === 'select' && !control.select) {
    throw new Error('activity_navigation_unavailable')
  }
  if (command.operation === 'jump' && !control.canJump(thread)) {
    throw new Error('activity_workspace_unavailable')
  }
  const workspaceId = thread.worktree.id
  const floating = command.operation === 'select' && workspaceId === FLOATING_TERMINAL_WORKTREE_ID
  const executionHostId = floating
    ? getResolvedExecutionHostIdForWorktree(initial, workspaceId)
    : getWorktreeExecutionHostId(
        thread.worktree,
        thread.repo ?? undefined,
        getSettingsFocusedExecutionHostId(initial.settings)
      )
  if (!executionHostId) {
    throw new Error('activity_workspace_owner_unavailable')
  }
  let sawTargetSelection = false
  let sawTargetFocus = false
  let targetFocusElement: Element | null = null
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
    return floating || (state.activeView === 'terminal' && state.activeWorktreeId === workspaceId)
  }
  const destinationSelected = (): boolean =>
    workspaceSelected() &&
    getResolvedExecutionHostIdForWorktree(useAppStore.getState(), workspaceId) === executionHostId
  const targetSelected = (): boolean =>
    isActivitySelectionTargetSelected(useAppStore.getState(), thread, executionHostId)
  const observeFocus = (): void => {
    if (command.operation !== 'select') {
      return
    }
    const focused =
      readActivitySelectionDestination(thread, executionHostId).reached === 'terminal-pane'
    if (focused && targetSelected()) {
      sawTargetFocus = true
      targetFocusElement = typeof document === 'undefined' ? null : document.activeElement
    } else if (sawTargetFocus) {
      superseded = true
    }
  }
  const observeFocusOut = (event: FocusEvent): void => {
    if (
      sawTargetFocus &&
      readActivitySelectionDestination(
        thread,
        executionHostId,
        event.relatedTarget instanceof Element ? event.relatedTarget : null
      ).reached !== 'terminal-pane'
    ) {
      superseded = true
    }
  }
  const observeNavigation = (): void => {
    if (
      floating &&
      (useAppStore.getState().activeWorktreeId !== initial.activeWorktreeId ||
        useAppStore.getState().activeView !== initial.activeView)
    ) {
      superseded = true
    }
    if (command.operation === 'select') {
      if (targetSelected() && workspaceSelected()) {
        sawTargetSelection = true
      } else if (sawTargetSelection) {
        superseded = true
      }
    }
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
  const focusDocument = typeof document === 'undefined' ? null : document
  if (command.operation === 'select') {
    focusDocument?.addEventListener('focusin', observeFocus)
    focusDocument?.addEventListener('focusout', observeFocusOut)
  }
  const focusRemovalObserver =
    command.operation === 'select' && focusDocument?.body && typeof MutationObserver !== 'undefined'
      ? new MutationObserver((records) => {
          if (
            targetFocusElement &&
            records.some((record) =>
              [...record.removedNodes].some((node) => node.contains(targetFocusElement))
            )
          ) {
            superseded = true
          }
        })
      : null
  if (focusDocument?.body) {
    focusRemovalObserver?.observe(focusDocument.body, { childList: true, subtree: true })
  }
  try {
    const outcome = command.operation === 'select' ? control.select?.(thread) : undefined
    const accepted =
      command.operation === 'jump'
        ? control.jump(thread)
        : outcome === undefined
          ? undefined
          : outcome !== 'workspace-unavailable'
    dispatched = true
    if (command.operation === 'select') {
      await Promise.resolve()
    }
    observeNavigation()
    const workspaceReached = (): boolean =>
      accepted === true &&
      sameRuntime() &&
      !superseded &&
      destinationSelected() &&
      (floating || readActivityWorkspaceDestination(workspaceId, executionHostId))
    const readSelection = (): ReturnType<typeof readActivitySelectionDestination> => {
      observeFocus()
      return readActivitySelectionDestination(thread, executionHostId)
    }
    const reachesDestination = (): boolean => {
      const selectionReached =
        command.operation === 'select'
          ? targetSelected() && readSelection().reached !== 'none'
          : true
      return workspaceReached() && selectionReached
    }
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    while (
      accepted === true &&
      sameRuntime() &&
      !superseded &&
      !(outcome === 'workspace-only' ? workspaceReached() : reachesDestination()) &&
      Date.now() < deadline
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const applied = Date.now() < request.expiresAt && reachesDestination()
    const selection =
      command.operation === 'select' && workspaceReached() && targetSelected()
        ? readSelection()
        : null
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
        operation: command.operation,
        ...(command.operation === 'select'
          ? {
              requestOutcome: outcome ?? 'unknown',
              contentState: selection?.contentState ?? 'unknown'
            }
          : {}),
        paneKey: command.paneKey,
        workspaceId,
        executionHostId,
        requestAccepted: typeof accepted === 'boolean' ? accepted : null,
        reached: applied
          ? command.operation === 'select'
            ? (selection?.reached ?? 'none')
            : 'workspace'
          : workspaceReached() && !floating
            ? 'workspace'
            : 'none',
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
    focusRemovalObserver?.disconnect()
    if (command.operation === 'select') {
      focusDocument?.removeEventListener('focusin', observeFocus)
      focusDocument?.removeEventListener('focusout', observeFocusOut)
    }
  }
}
