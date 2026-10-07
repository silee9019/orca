import { useAppStore } from '@/store'
import { ProjectFilterParams } from '../../../shared/rpc-contract/project-filter-params'
import type { ProjectFilterRequest, ProjectFilterResult } from '../../../shared/project-filter'
import { waitForProjectFilterView } from './project-filter-view'

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index])

export async function applyProjectFilterRequest(
  request: ProjectFilterRequest
): Promise<Omit<ProjectFilterResult, 'viewerId'>> {
  const command = ProjectFilterParams.parse(request.command)
  const initial = useAppStore.getState()
  const initialRepoIds = [...initial.filterRepoIds]
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  if (!initial.persistedUIReady || !initial.settings) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  const repoIds =
    command.operation === 'set'
      ? [...new Set(command.repoIds)]
      : command.operation === 'clear'
        ? []
        : [...initial.filterRepoIds]
  if (
    command.operation === 'set' &&
    repoIds.some((id) => !initial.repos.some((repo) => repo.id === id))
  ) {
    throw new Error('project_not_found')
  }

  if (command.operation !== 'get') {
    if (typeof window.api.ui.setWithAck !== 'function') {
      throw new Error('persistence_ack_unavailable')
    }
    initial.notePersistedUIWriteStarted(['filterRepoIds'])
    let saved = false
    try {
      await window.api.ui.setWithAck({ filterRepoIds: repoIds })
      saved = true
      const current = useAppStore.getState()
      if (
        current.settings &&
        !current.settings.activeRuntimeEnvironmentId &&
        sameIds(current.filterRepoIds, initialRepoIds)
      ) {
        current.setFilterRepoIds(repoIds)
      }
    } finally {
      useAppStore
        .getState()
        .notePersistedUIWriteSettled(['filterRepoIds'], saved ? { filterRepoIds: repoIds } : null)
    }
  }
  const durable = await window.api.ui.get()
  const persisted = sameIds(durable.filterRepoIds ?? [], repoIds)
  const view = await waitForProjectFilterView(
    repoIds,
    Math.max(0, Math.min(5000, request.expiresAt - Date.now() - 100))
  )
  const current = useAppStore.getState()
  const applied =
    view !== null &&
    current.settings !== null &&
    !current.settings.activeRuntimeEnvironmentId &&
    sameIds(current.filterRepoIds, repoIds)
  return {
    viewer: 'host',
    repoIds,
    persisted,
    applied,
    visibleWorktreeIds: applied ? [...view.visibleWorktreeIds] : null,
    visibleFolderWorkspaceIds: applied ? [...view.visibleFolderWorkspaceIds] : null,
    ...(!persisted
      ? { reason: 'persistence_superseded' }
      : !applied
        ? { reason: 'viewer_not_applied' }
        : {})
  }
}

export function attachProjectFilterBridge(): () => void {
  if (!window.api.ui.onProjectFilterRequest || !window.api.ui.respondProjectFilter) {
    return () => {}
  }
  let queue = Promise.resolve()
  return window.api.ui.onProjectFilterRequest((request) => {
    queue = queue.then(async () => {
      try {
        const result = await applyProjectFilterRequest(request)
        window.api.ui.respondProjectFilter?.({
          id: request.id,
          ok: true,
          result: { ...result, viewerId: 0 }
        })
      } catch (error) {
        window.api.ui.respondProjectFilter?.({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })
  })
}
