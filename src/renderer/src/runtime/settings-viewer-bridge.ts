import { useAppStore } from '@/store'
import { getProjectHostSetupProjectionFromState } from '@/store/selectors'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { isSettingsNavigationTarget } from '@/lib/settings-navigation-types'
import {
  buildSettingsProjectList,
  buildRepoIdToRepresentative,
  getSettingsTargetHostSelection,
  resolveSettingsTargetRepoId
} from '@/components/settings/settings-project-list'
import { getSettingsSectionId } from '@/components/settings/settings-navigation-foundations'
import { SettingsViewerParams } from '../../../shared/rpc-contract/settings-viewer-params'
import type {
  SettingsViewerRequest,
  SettingsViewerResult,
  SettingsViewerResponse
} from '../../../shared/settings-viewer-command'
import {
  readSettingsViewerView,
  waitForSettingsViewerView,
  type SettingsViewerView
} from './settings-viewer-view'

export type SettingsViewerCatalog = { runtimeContextKey: string; sectionIds: readonly string[] }
export async function applySettingsViewerRequest(
  request: SettingsViewerRequest,
  catalog: SettingsViewerCatalog
): Promise<Omit<SettingsViewerResult, 'viewerId'>> {
  const command = SettingsViewerParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = useAppStore.getState()
  if (!initial.settings || !initial.persistedUIReady) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  const runtimeContextKey = getProviderRuntimeContextKey(initial.settings)
  if (catalog.runtimeContextKey !== runtimeContextKey) {
    throw new Error('settings_catalog_not_ready')
  }
  const existing = readSettingsViewerView()
  if (
    initial.activeView === 'settings' &&
    (!existing || existing.runtimeContextKey !== runtimeContextKey)
  ) {
    throw new Error('viewer_not_ready')
  }
  if (existing?.hasUnsavedChanges) {
    throw new Error('unsaved_settings_changes')
  }
  let resolvedSectionId: string | null = null
  if (command.operation === 'open') {
    const target = {
      pane: command.pane,
      repoId: command.repoId ?? null,
      ...(command.hostId ? { hostId: command.hostId } : {}),
      ...(command.sectionId ? { sectionId: command.sectionId } : {})
    }
    if (!isSettingsNavigationTarget(target)) {
      throw new Error('invalid_settings_target')
    }
    const projection = getProjectHostSetupProjectionFromState(initial)
    const projects = buildSettingsProjectList(initial.repos, {
      projects: projection.projects,
      projectHostSetups: projection.setups
    })
    const representatives = buildRepoIdToRepresentative(projects)
    if (target.repoId && !initial.repos.some((repo) => repo.id === target.repoId)) {
      throw new Error('project_not_found')
    }
    if (
      target.repoId &&
      target.hostId &&
      !getSettingsTargetHostSelection(projects, target.repoId, target.hostId)
    ) {
      throw new Error('settings_project_host_unavailable')
    }
    if (
      target.pane !== 'repo' &&
      resolveSettingsTargetRepoId(target, representatives.keys()) !== null
    ) {
      throw new Error('invalid_settings_target')
    }
    resolvedSectionId = getSettingsSectionId(target.pane, target.repoId, representatives)
    if (!catalog.sectionIds.includes(resolvedSectionId)) {
      throw new Error('settings_pane_unavailable')
    }
    initial.openSettingsTarget(target)
  }
  initial.openSettingsPage()
  if (command.operation === 'search') {
    initial.setSettingsSearchQuery(command.query)
  }
  const query = command.operation === 'search' ? command.query : ''
  const targetId = command.operation === 'open' ? (command.sectionId ?? resolvedSectionId) : null
  const matches = (value: SettingsViewerView): boolean => {
    const state = useAppStore.getState()
    return (
      (value !== existing || (command.operation === 'search' && query === '')) &&
      state.activeView === 'settings' &&
      state.settingsSearchInputQuery === query &&
      state.settingsSearchQuery === query &&
      !value.navigationPending &&
      value.runtimeContextKey === runtimeContextKey &&
      value.queryInput === query &&
      value.queryApplied === query &&
      (command.operation === 'search' ||
        (value.activeSectionId === resolvedSectionId &&
          value.renderedSectionIds.includes(resolvedSectionId ?? '') &&
          value.renderedTargetIds.includes(targetId ?? '')))
    )
  }
  const view = await waitForSettingsViewerView(
    matches,
    Math.max(0, Math.min(5000, request.expiresAt - Date.now() - 100))
  )
  const latest = useAppStore.getState()
  const sameRuntime =
    latest.settings !== null && getProviderRuntimeContextKey(latest.settings) === runtimeContextKey
  const current = sameRuntime ? readSettingsViewerView() : null
  const applied =
    view !== null &&
    current !== null &&
    matches(current) &&
    sameRuntime &&
    latest.activeView === 'settings' &&
    Date.now() < request.expiresAt &&
    latest.settingsSearchInputQuery === query &&
    latest.settingsSearchQuery === query
  return {
    viewer: 'host',
    applied,
    resolvedSectionId,
    activeSectionId: current?.activeSectionId ?? null,
    queryInput: current?.queryInput ?? '',
    queryApplied: current?.queryApplied ?? '',
    visibleSectionIds: current?.visibleSectionIds ?? [],
    renderedSectionIds: current?.renderedSectionIds ?? [],
    sectionTargetPresent:
      targetId !== null && current?.renderedTargetIds.includes(targetId) === true,
    ...(!sameRuntime
      ? { reason: 'viewer_runtime_changed' as const }
      : !applied
        ? {
            reason:
              command.operation === 'open'
                ? ('settings_target_not_rendered' as const)
                : ('viewer_not_applied' as const)
          }
        : {})
  }
}

export type SettingsViewerBridgeApi = {
  onSettingsViewerRequest?: (callback: (request: SettingsViewerRequest) => void) => () => void
  respondSettingsViewer?: (response: SettingsViewerResponse) => void
}
export function attachSettingsViewerBridge(
  api: SettingsViewerBridgeApi,
  getCatalog: () => SettingsViewerCatalog
): () => void {
  if (!api.onSettingsViewerRequest || !api.respondSettingsViewer) {
    return () => {}
  }
  const respond = api.respondSettingsViewer
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onSettingsViewerRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applySettingsViewerRequest(request, getCatalog())
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
