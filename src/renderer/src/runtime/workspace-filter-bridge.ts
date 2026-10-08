import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { WorkspaceFilterParams } from '../../../shared/rpc-contract/workspace-filter-params'
import {
  defaultWorkspaceFilters,
  readWorkspaceFilters,
  sameWorkspaceFilters,
  WORKSPACE_FILTER_FIELDS
} from '../../../shared/workspace-filter-command'
import type {
  WorkspaceFilterRequest,
  WorkspaceFilterResponse,
  WorkspaceFilterResult
} from '../../../shared/workspace-filter-command'
import { waitForWorkspaceFilterView } from './workspace-filter-view'
import { readProjectFilterControl, requestProjectFilterControl } from './project-filter-controls'

export async function applyWorkspaceFilterRequest(
  request: WorkspaceFilterRequest
): Promise<Omit<WorkspaceFilterResult, 'viewerId'>> {
  const command = WorkspaceFilterParams.parse(request.command)
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
  const runtimeContextKey = getProviderRuntimeContextKey(initial.settings)
  const initialFilters = readWorkspaceFilters(initial)
  const selection =
    command.operation === 'select-project' || command.operation === 'remove-last-project'
      ? readProjectFilterControl(command.surface)
      : null
  if (
    command.operation === 'select-project' &&
    (!selection?.resultRepoIds.includes(command.repoId) ||
      selection.highlightedRepoId !== command.repoId)
  ) {
    throw new Error('project_not_highlighted')
  }
  if (command.operation === 'remove-last-project' && selection?.query !== '') {
    throw new Error('filter_query_not_empty')
  }
  const lastProjectId = initial.repos.findLast((repo) =>
    initialFilters.filterRepoIds.includes(repo.id)
  )?.id
  const control =
    command.operation === 'control'
      ? await requestProjectFilterControl(command.control, request.expiresAt)
      : undefined
  const patch =
    command.operation === 'set'
      ? command.filters
      : command.operation === 'reset'
        ? defaultWorkspaceFilters()
        : command.operation === 'select-project'
          ? {
              filterRepoIds: initialFilters.filterRepoIds.includes(command.repoId)
                ? initialFilters.filterRepoIds
                : [...initialFilters.filterRepoIds, command.repoId]
            }
          : command.operation === 'remove-last-project'
            ? { filterRepoIds: initialFilters.filterRepoIds.filter((id) => id !== lastProjectId) }
            : command.operation === 'remove-project' || command.operation === 'toggle-project'
              ? {
                  filterRepoIds:
                    command.operation === 'remove-project' ||
                    initialFilters.filterRepoIds.includes(command.repoId)
                      ? initialFilters.filterRepoIds.filter((id) => id !== command.repoId)
                      : [...initialFilters.filterRepoIds, command.repoId]
                }
              : null
  if (
    command.operation === 'toggle-project' &&
    !initial.repos.some((repo) => repo.id === command.repoId)
  ) {
    throw new Error('project_not_found')
  }
  if (
    command.operation === 'set' &&
    patch?.filterRepoIds?.some((id) => !initial.repos.some((repo) => repo.id === id))
  ) {
    throw new Error('project_not_found')
  }
  const filters = { ...initialFilters, ...patch }
  if (patch) {
    if (!window.api.ui.setWithAck) {
      throw new Error('persistence_ack_unavailable')
    }
    const fields = WORKSPACE_FILTER_FIELDS.filter((key) => key in patch)
    const sentAtGeneration = initial.persistedUIWriteBaselineGeneration
    initial.notePersistedUIWriteStarted(fields)
    let saved = false
    try {
      await window.api.ui.setWithAck(patch)
      saved = true
      const current = useAppStore.getState()
      if (
        Date.now() < request.expiresAt &&
        current.settings &&
        getProviderRuntimeContextKey(current.settings) === runtimeContextKey &&
        sameWorkspaceFilters(readWorkspaceFilters(current), initialFilters)
      ) {
        useAppStore.setState(patch)
      }
    } finally {
      const latest = useAppStore.getState()
      latest.notePersistedUIWriteSettled(
        fields,
        saved &&
          latest.settings &&
          getProviderRuntimeContextKey(latest.settings) === runtimeContextKey
          ? patch
          : null,
        { sentAtGeneration }
      )
    }
  }
  const beforeRead = useAppStore.getState()
  const durable =
    beforeRead.settings && getProviderRuntimeContextKey(beforeRead.settings) === runtimeContextKey
      ? await window.api.ui.get()
      : null
  const afterRead = useAppStore.getState()
  if (
    !durable ||
    !afterRead.settings ||
    getProviderRuntimeContextKey(afterRead.settings) !== runtimeContextKey
  ) {
    return {
      viewer: 'host',
      filters,
      persisted: null,
      applied: false,
      visibleWorktreeIds: null,
      visibleFolderWorkspaceIds: null,
      reason: 'viewer_runtime_changed_persistence_unknown'
    }
  }
  const persisted = sameWorkspaceFilters({ ...defaultWorkspaceFilters(), ...durable }, filters)
  const view = await waitForWorkspaceFilterView(
    filters,
    runtimeContextKey,
    Math.max(0, Math.min(5000, request.expiresAt - Date.now() - 100))
  )
  const current = useAppStore.getState()
  let applied =
    view !== null &&
    Date.now() < request.expiresAt &&
    current.settings !== null &&
    getProviderRuntimeContextKey(current.settings) === runtimeContextKey &&
    sameWorkspaceFilters(readWorkspaceFilters(current), filters)
  let selectedControl
  if (applied && persisted && command.operation === 'select-project') {
    if (readProjectFilterControl(command.surface).query !== selection?.query) {
      throw new Error('filter_control_superseded')
    }
    selectedControl = await requestProjectFilterControl(
      { action: 'search', surface: command.surface, query: '' },
      request.expiresAt
    )
    const latest = useAppStore.getState()
    applied =
      Date.now() < request.expiresAt &&
      latest.settings !== null &&
      getProviderRuntimeContextKey(latest.settings) === runtimeContextKey &&
      sameWorkspaceFilters(readWorkspaceFilters(latest), filters)
  }
  return {
    viewer: 'host',
    filters,
    persisted,
    applied,
    ...(control ? { control } : {}),
    ...(selectedControl ? { control: selectedControl } : {}),
    visibleWorktreeIds: applied && view ? [...view.visibleWorktreeIds] : null,
    visibleFolderWorkspaceIds: applied && view ? [...view.visibleFolderWorkspaceIds] : null,
    ...(!persisted
      ? { reason: 'persistence_superseded' as const }
      : !applied
        ? { reason: 'viewer_not_applied' as const }
        : {})
  }
}

export type WorkspaceFilterBridgeApi = {
  onWorkspaceFilterRequest?: (callback: (request: WorkspaceFilterRequest) => void) => () => void
  respondWorkspaceFilter?: (response: WorkspaceFilterResponse) => void
}

export function attachWorkspaceFilterBridge(api: WorkspaceFilterBridgeApi): () => void {
  if (!api.onWorkspaceFilterRequest || !api.respondWorkspaceFilter) {
    return () => {}
  }
  const respond = api.respondWorkspaceFilter
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onWorkspaceFilterRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applyWorkspaceFilterRequest(request)
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
