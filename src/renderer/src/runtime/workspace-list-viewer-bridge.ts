import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { withTimeout } from '../../../shared/promise-timeout-fallback'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import { WorkspaceListViewerParams } from '../../../shared/rpc-contract/workspace-list-viewer-params'
import type {
  WorkspaceListViewerRequest,
  WorkspaceListViewerResult,
  WorkspaceListViewerResponse
} from '../../../shared/workspace-list-viewer-command'
import {
  readWorkspaceListCollapseControl,
  readWorkspaceListViewerView
} from './workspace-list-viewer-view'

export async function applyWorkspaceListViewerRequest(
  request: WorkspaceListViewerRequest
): Promise<Omit<WorkspaceListViewerResult, 'viewerId'>> {
  const command = WorkspaceListViewerParams.parse(request.command)
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
  if (command.operation === 'project-order' && initial.groupBy !== 'repo') {
    throw new Error('project_order_unavailable')
  }
  if (command.operation !== 'get' && !window.api.ui.setWithAck) {
    throw new Error('persistence_ack_unavailable')
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const toggleControl =
    command.operation === 'group-toggle' ? readWorkspaceListCollapseControl() : null
  if (command.operation === 'group-toggle') {
    const view = readWorkspaceListViewerView()
    if (
      !toggleControl ||
      !view ||
      view.empty ||
      view.runtimeContextKey !== runtime ||
      !view.collapsibleKeys?.includes(command.groupKey)
    ) {
      throw new Error('workspace_list_group_unavailable')
    }
  }
  let writeOutcome: WorkspaceListViewerResult['writeOutcome'] = 'not_requested'
  let dispatched = false
  let saving: Promise<void> | undefined
  if (command.operation === 'group') {
    dispatched = true
    saving = initial.setGroupBy(command.by)
  } else if (command.operation === 'sort' && initial.sortBy !== command.by) {
    dispatched = true
    initial.setSortBy(command.by)
    writeOutcome = 'unknown'
  } else if (command.operation === 'project-order' && initial.projectOrderBy !== command.by) {
    dispatched = true
    initial.setProjectOrderBy(command.by)
    writeOutcome = 'unknown'
  } else if (command.operation === 'group-toggle' && toggleControl) {
    dispatched = true
    toggleControl.toggle(command.groupKey)
    writeOutcome = 'unknown'
  }
  const expected = useAppStore.getState()
  const groupBy = expected.groupBy
  const sortBy = expected.sortBy
  const projectOrderBy = expected.projectOrderBy
  const collapsedGroups = [...expected.collapsedGroups]
  const sameCollapsed = (groups: readonly string[]): boolean =>
    groups.length === collapsedGroups.length && groups.every((key) => collapsedGroups.includes(key))
  const stillExpected = (): boolean => {
    const state = useAppStore.getState()
    return (
      sameRuntime() &&
      state.groupBy === groupBy &&
      state.sortBy === sortBy &&
      state.projectOrderBy === projectOrderBy &&
      sameCollapsed([...state.collapsedGroups])
    )
  }
  const persistenceDeadline = Math.min(request.expiresAt - 100, Date.now() + 5000)
  if (saving) {
    writeOutcome = await withTimeout<WorkspaceListViewerResult['writeOutcome']>(
      saving.then(
        () => 'accepted',
        () => 'rejected'
      ),
      Math.max(0, persistenceDeadline - Date.now()),
      'unknown'
    )
  } else if (command.operation === 'sort' || command.operation === 'project-order') {
    const field = command.operation === 'sort' ? 'sortBy' : 'projectOrderBy'
    while (stillExpected() && Date.now() < persistenceDeadline) {
      const state = useAppStore.getState()
      if (
        state.persistedUIWriteBaseline?.[field] === command.by &&
        (state.persistedUIWriteInFlightCounts[field] ?? 0) === 0
      ) {
        break
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
  }
  let ui: PersistedUIState | null = null
  let uiRead = false
  if (command.operation === 'group-toggle') {
    // Why: the original toggle writes without an acknowledgement, so poll the host until it shows the toggled set.
    while (stillExpected() && Date.now() < persistenceDeadline) {
      ui = await withTimeout<PersistedUIState | null>(
        window.api.ui.get(),
        Math.max(0, persistenceDeadline - Date.now()),
        null
      )
      uiRead = ui !== null
      if (ui !== null && sameCollapsed(ui.collapsedGroups ?? [])) {
        break
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    if (!sameRuntime()) {
      ui = null
    }
  }
  if (sameRuntime() && !uiRead) {
    ui = await withTimeout<PersistedUIState | null>(
      window.api.ui.get(),
      Math.max(0, request.expiresAt - Date.now() - 50),
      null
    )
  }
  const persisted =
    sameRuntime() && ui !== null
      ? writeOutcome !== 'rejected' &&
        (command.operation === 'group' || command.operation === 'group-toggle'
          ? ui.groupBy === groupBy && sameCollapsed(ui.collapsedGroups ?? [])
          : command.operation === 'sort'
            ? ui.sortBy === sortBy
            : command.operation === 'project-order'
              ? ui.projectOrderBy === projectOrderBy
              : ui.groupBy === groupBy &&
                ui.sortBy === sortBy &&
                ui.projectOrderBy === projectOrderBy &&
                sameCollapsed(ui.collapsedGroups ?? []))
      : null
  const matches = (): boolean => {
    const view = readWorkspaceListViewerView()
    return (
      stillExpected() &&
      view !== null &&
      view.runtimeContextKey === runtime &&
      view.groupBy === groupBy &&
      view.sortBy === sortBy &&
      view.projectOrderBy === projectOrderBy &&
      sameCollapsed(view.collapsedGroups)
    )
  }
  const viewDeadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
  while (
    stillExpected() &&
    readWorkspaceListViewerView() !== null &&
    !matches() &&
    Date.now() < viewDeadline
  ) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  const rendered = sameRuntime() ? readWorkspaceListViewerView() : null
  const applied = Date.now() < request.expiresAt && matches()
  const reason = !sameRuntime()
    ? ('viewer_runtime_changed' as const)
    : !stillExpected()
      ? ('viewer_surface_superseded' as const)
      : writeOutcome === 'rejected'
        ? ('persistence_failed' as const)
        : persisted === null
          ? ('persistence_unverifiable' as const)
          : !persisted
            ? ('persistence_superseded' as const)
            : !rendered
              ? ('workspace_list_unavailable' as const)
              : !applied
                ? ('viewer_not_applied' as const)
                : undefined
  return {
    viewer: 'host',
    dispatched,
    applied,
    persisted,
    writeOutcome,
    metadataPersisted: null,
    groupBy,
    sortBy,
    projectOrderBy,
    collapsedGroups,
    rendered,
    ...(reason ? { reason } : {})
  }
}

export type WorkspaceListViewerBridgeApi = {
  onWorkspaceListViewerRequest?: (
    callback: (request: WorkspaceListViewerRequest) => void
  ) => () => void
  respondWorkspaceListViewer?: (response: WorkspaceListViewerResponse) => void
}
export function attachWorkspaceListViewerBridge(api: WorkspaceListViewerBridgeApi): () => void {
  if (!api.onWorkspaceListViewerRequest || !api.respondWorkspaceListViewer) {
    return () => {}
  }
  const respond = api.respondWorkspaceListViewer
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onWorkspaceListViewerRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applyWorkspaceListViewerRequest(request)
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
