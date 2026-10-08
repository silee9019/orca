import {
  attachActivityViewerRequestQueue,
  type ActivityViewerBridgeApi
} from './activity-viewer-request-queue'
export type { ActivityViewerBridgeApi } from './activity-viewer-request-queue'
import {
  applyActivityScopeCommand,
  isActivityScopeCommand,
  readActivityScope,
  readPersistedActivityScope,
  sameActivityScope
} from './activity-scope-preferences'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { withTimeout } from '../../../shared/promise-timeout-fallback'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import { ActivityViewerParams } from '../../../shared/rpc-contract/activity-viewer-params'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import {
  readActivityMarkAllReadControl,
  readActivityThreadReadControl,
  readActivityViewerView
} from './activity-viewer-view'
import {
  applyActivityThreadReadCommand,
  activityThreadReadApplied,
  readActivityThreadReadStates,
  sameActivityThreadReadCallbacks
} from './activity-thread-read-command'
import { captureActivitySearchControl } from './activity-search-controls'

export async function applyActivityViewerRequest(
  request: ActivityViewerRequest
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const command = ActivityViewerParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = useAppStore.getState()
  if (!initial.persistedUIReady || !initial.settings) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  const localSearch = command.operation === 'search' || command.operation === 'search-clear'
  const markAllRead = command.operation === 'mark-all-read'
  const threadRead = command.operation === 'read-toggle' || command.operation === 'read-toggle-many'
  const localOnly = localSearch || markAllRead || threadRead
  if (command.operation !== 'get' && !localOnly && !window.api.ui.setWithAck) {
    throw new Error('persistence_ack_unavailable')
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const scopeCommand = isActivityScopeCommand(command)
  if (scopeCommand || markAllRead || threadRead) {
    const view = readActivityViewerView(command.surface)
    if (!view || view.surface !== command.surface || view.runtimeContextKey !== runtime) {
      throw new Error('activity_surface_unavailable')
    }
  }
  const readControl = threadRead ? readActivityThreadReadControl(command.surface) : null
  if (threadRead && !readControl) {
    throw new Error('activity_read_control_unavailable')
  }
  const readQuery = threadRead ? readActivityViewerView(command.surface)?.query : undefined
  const readAction =
    threadRead && readControl ? applyActivityThreadReadCommand(command, readControl) : null
  const markAllControl = markAllRead ? readActivityMarkAllReadControl(command.surface) : null
  if (markAllRead && !markAllControl) {
    throw new Error('activity_read_control_unavailable')
  }
  const markAllDispatched = markAllControl?.hasUnreadThreads === true
  if (markAllDispatched) {
    markAllControl.markAllRead()
  }
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const searchControl =
    localSearch || command.operation === 'search-visible'
      ? captureActivitySearchControl(command.surface)
      : null
  if (searchControl && !readActivityViewerView(command.surface)) {
    throw new Error('activity_surface_unavailable')
  }
  if (command.operation === 'search') {
    const input = searchControl?.getInput()
    if (!input || !input.isConnected || input.getBoundingClientRect().width <= 0) {
      throw new Error('activity_search_unavailable')
    }
    searchControl?.setQuery(command.query)
  }
  if (command.operation === 'search-clear') {
    const input = searchControl?.getInput()
    const button = input?.parentElement?.querySelector('[data-activity-search-clear]')
    if (
      !(button instanceof HTMLButtonElement) ||
      !button.isConnected ||
      button.disabled ||
      button.getBoundingClientRect().width <= 0
    ) {
      throw new Error('activity_search_unavailable')
    }
    button.click()
  }
  let saving = scopeCommand ? applyActivityScopeCommand(command, initial) : undefined
  if (command.operation === 'search-visible') {
    if (!searchControl?.setShowSearch) {
      throw new Error('activity_search_unavailable')
    }
    saving = searchControl.setShowSearch(command.enabled)
  }
  if (command.operation === 'group') {
    saving = initial.setAgentsGroupBy(command.by)
  } else if (command.operation === 'read') {
    saving = initial.setAgentsReadFilter(command.filter)
  } else if (command.operation === 'compact') {
    saving = initial.setAgentsCompactMode(command.enabled)
  } else if (command.operation === 'children') {
    saving = initial.setAgentsShowChildAgents(command.enabled)
  }
  const expected = useAppStore.getState()
  const expectedScope = scopeCommand || threadRead ? readActivityScope(expected) : undefined
  const groupBy = expected.agentsGroupBy
  const readFilter = expected.agentsReadFilter
  const compact = expected.agentsCompactMode
  const showChildAgents = expected.agentsShowChildAgents
  const showSearch = expected.agentsShowSearch
  const requestedQuery =
    command.operation === 'search'
      ? command.query
      : command.operation === 'search-clear' ||
          (command.operation === 'search-visible' && !command.enabled)
        ? ''
        : undefined
  const stillExpected = (): boolean => {
    const state = useAppStore.getState()
    return (
      sameRuntime() &&
      (readAction === null ||
        (sameActivityThreadReadCallbacks(
          readActivityThreadReadControl(command.surface),
          readAction.control
        ) &&
          readActivityViewerView(command.surface)?.query === readQuery)) &&
      (markAllControl === null ||
        readActivityMarkAllReadControl(command.surface)?.markAllRead ===
          markAllControl.markAllRead) &&
      (expectedScope === undefined || sameActivityScope(readActivityScope(state), expectedScope)) &&
      state.agentsGroupBy === groupBy &&
      state.agentsReadFilter === readFilter &&
      state.agentsCompactMode === compact &&
      state.agentsShowChildAgents === showChildAgents &&
      (command.operation !== 'search-visible' || state.agentsShowSearch === showSearch)
    )
  }
  const writeOutcome: ActivityViewerResult['writeOutcome'] = saving
    ? await withTimeout<ActivityViewerResult['writeOutcome']>(
        saving.then(
          () => 'accepted',
          () => 'rejected'
        ),
        Math.max(0, Math.min(request.expiresAt - 100, Date.now() + 5000) - Date.now()),
        'unknown'
      )
    : 'not_requested'
  const ui =
    sameRuntime() && !localOnly
      ? await withTimeout<PersistedUIState | null>(
          window.api.ui.get(),
          Math.max(0, request.expiresAt - Date.now() - 50),
          null
        )
      : null
  const persistedScope = scopeCommand && ui !== null ? readPersistedActivityScope(ui) : null
  const persisted =
    sameRuntime() && ui !== null && (!scopeCommand || persistedScope !== null)
      ? writeOutcome !== 'rejected' &&
        (expectedScope !== undefined
          ? sameActivityScope(persistedScope, expectedScope)
          : command.operation === 'group'
            ? ui.agentsGroupBy === groupBy
            : command.operation === 'read'
              ? ui.agentsReadFilter === readFilter
              : command.operation === 'compact'
                ? ui.agentsCompactMode === compact
                : command.operation === 'children'
                  ? ui.agentsShowChildAgents === showChildAgents
                  : command.operation === 'search-visible'
                    ? ui.agentsShowSearch === showSearch
                    : ui.agentsGroupBy === groupBy &&
                      ui.agentsReadFilter === readFilter &&
                      ui.agentsCompactMode === compact &&
                      ui.agentsShowChildAgents === showChildAgents)
      : null
  const matches = (): boolean => {
    const view = readActivityViewerView(command.surface)
    return (
      stillExpected() &&
      view !== null &&
      view.surface === command.surface &&
      view.runtimeContextKey === runtime &&
      (readAction === null ||
        activityThreadReadApplied(readActivityThreadReadControl(command.surface), readAction)) &&
      (!markAllRead || view.hasUnreadThreads === false) &&
      (expectedScope === undefined || sameActivityScope(view.scope, expectedScope)) &&
      view.groupBy === groupBy &&
      view.readFilter === readFilter &&
      view.compact === compact &&
      view.showChildAgents === showChildAgents &&
      view.querySettled &&
      (requestedQuery === undefined ||
        (view.query === requestedQuery && searchControl?.getQuery() === requestedQuery)) &&
      (searchControl === null || captureActivitySearchControl(command.surface) === searchControl) &&
      (command.operation !== 'search' || searchControl?.getInput()?.value === command.query) &&
      (command.operation !== 'search-clear' ||
        (searchControl?.getInput()?.value === '' &&
          searchControl?.getInput() === document.activeElement)) &&
      (command.operation !== 'search-visible' ||
        (command.enabled
          ? searchControl?.getInput() === document.activeElement
          : searchControl?.getInput() === null)) &&
      (command.operation !== 'compact' || (view.densityMeasured && view.renderedRows.length > 0))
    )
  }
  const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
  while (
    stillExpected() &&
    readActivityViewerView(command.surface) !== null &&
    !matches() &&
    Date.now() < deadline
  ) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  const rendered = sameRuntime() ? readActivityViewerView(command.surface) : null
  const applied = Date.now() < request.expiresAt && matches()
  const reason = !sameRuntime()
    ? ('viewer_runtime_changed' as const)
    : !stillExpected()
      ? ('viewer_surface_superseded' as const)
      : writeOutcome === 'rejected'
        ? ('persistence_failed' as const)
        : persisted === null && !localOnly
          ? ('persistence_unverifiable' as const)
          : persisted === false
            ? ('persistence_superseded' as const)
            : !rendered
              ? ('activity_surface_unavailable' as const)
              : command.operation === 'compact' && rendered.renderedRows.length === 0
                ? ('activity_rows_unavailable' as const)
                : !applied
                  ? ('viewer_not_applied' as const)
                  : undefined
  return {
    viewer: 'host',
    surface: command.surface,
    dispatched:
      saving !== undefined ||
      localSearch ||
      markAllDispatched ||
      (readAction !== null && readAction.targets.length > 0),
    applied,
    persisted,
    ...(scopeCommand ? { persistedScope } : {}),
    ...(readAction
      ? {
          readAction: {
            operation: readAction.operation,
            paneKeys: readAction.targets.map((thread) => thread.paneKey)
          },
          readStates: readActivityThreadReadStates(
            sameRuntime() ? readActivityThreadReadControl(command.surface) : null,
            readAction
          )
        }
      : {}),
    writeOutcome,
    groupBy,
    readFilter,
    compact,
    showChildAgents,
    rendered,
    ...(reason ? { reason } : {})
  }
}

export function attachActivityViewerBridge(api: ActivityViewerBridgeApi): () => void {
  return attachActivityViewerRequestQueue(api, applyActivityViewerRequest)
}
