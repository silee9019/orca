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
  ActivityViewerResult,
  ActivityViewerResponse
} from '../../../shared/activity-viewer-command'
import { readActivityViewerView } from './activity-viewer-view'
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
  if (command.operation !== 'get' && !localSearch && !window.api.ui.setWithAck) {
    throw new Error('persistence_ack_unavailable')
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const scopeCommand = isActivityScopeCommand(command)
  if (scopeCommand) {
    const view = readActivityViewerView(command.surface)
    if (!view || view.surface !== command.surface || view.runtimeContextKey !== runtime) {
      throw new Error('activity_surface_unavailable')
    }
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
  const expectedScope = scopeCommand ? readActivityScope(expected) : undefined
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
    sameRuntime() && !localSearch
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
        : persisted === null && !localSearch
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
    dispatched: saving !== undefined || localSearch,
    applied,
    persisted,
    ...(scopeCommand ? { persistedScope } : {}),
    writeOutcome,
    groupBy,
    readFilter,
    compact,
    showChildAgents,
    rendered,
    ...(reason ? { reason } : {})
  }
}

export type ActivityViewerBridgeApi = {
  onActivityViewerRequest?: (callback: (request: ActivityViewerRequest) => void) => () => void
  respondActivityViewer?: (response: ActivityViewerResponse) => void
}
export function attachActivityViewerBridge(api: ActivityViewerBridgeApi): () => void {
  if (!api.onActivityViewerRequest || !api.respondActivityViewer) {
    return () => {}
  }
  const respond = api.respondActivityViewer
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onActivityViewerRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applyActivityViewerRequest(request)
        if (!disposed) {
          respond({ id: request.id, ok: true, result: { ...result, viewerId: 0 } })
        }
      } catch (error) {
        if (!disposed) {
          respond({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : 'viewer_operation_failed'
          })
        }
      }
    })
  })
  return () => {
    disposed = true
    unsubscribe()
  }
}
