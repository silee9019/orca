import type { AppState } from '@/store/types'
import {
  buildSidebarHostOptions,
  shouldShowHostScopeControls
} from '@/components/sidebar/sidebar-host-options'
import {
  getToggledAllHostIds,
  getToggledHostIds
} from '@/components/sidebar/sidebar-host-scope-toggle'
import { getHostDisplayLabelOverrides } from '../../../shared/host-setting-overrides'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import {
  ActivityViewerScopeSchema,
  type ActivityViewerScope
} from '../../../shared/activity-viewer-scope'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'

type ScopeFields =
  | 'agentsVisibleHostIds'
  | 'agentsFilterRepoIds'
  | 'agentsHideWorkspacesFromOtherDevices'
  | 'agentsHideAutomationGeneratedWorkspaces'
  | 'agentsHideCliCreatedWorkspaces'
export function readActivityScope(state: Pick<AppState, ScopeFields>): ActivityViewerScope {
  return {
    visibleHostIds: state.agentsVisibleHostIds === null ? null : [...state.agentsVisibleHostIds],
    filterRepoIds: [...state.agentsFilterRepoIds],
    hideOtherClients: state.agentsHideWorkspacesFromOtherDevices,
    hideAutomation: state.agentsHideAutomationGeneratedWorkspaces,
    hideCli: state.agentsHideCliCreatedWorkspaces
  }
}
export function readPersistedActivityScope(ui: PersistedUIState): ActivityViewerScope | null {
  const parsed = ActivityViewerScopeSchema.safeParse({
    visibleHostIds: ui.agentsVisibleHostIds,
    filterRepoIds: ui.agentsFilterRepoIds,
    hideOtherClients: ui.agentsHideWorkspacesFromOtherDevices,
    hideAutomation: ui.agentsHideAutomationGeneratedWorkspaces,
    hideCli: ui.agentsHideCliCreatedWorkspaces
  })
  return parsed.success ? parsed.data : null
}
export function sameActivityScope(
  left: ActivityViewerScope | undefined | null,
  right: ActivityViewerScope
): boolean {
  return left != null && JSON.stringify(left) === JSON.stringify(right)
}
export function isActivityOtherClientFilterVisible(
  state: Pick<
    AppState,
    | 'runtimeEnvironmentCatalogHydrated'
    | 'runtimeEnvironments'
    | 'agentsHideWorkspacesFromOtherDevices'
  >
): boolean {
  return (
    !state.runtimeEnvironmentCatalogHydrated ||
    state.runtimeEnvironments.length > 0 ||
    state.agentsHideWorkspacesFromOtherDevices
  )
}
export function resetActivityScope(
  state: Pick<AppState, 'setAgentsVisibleHostIds' | 'setAgentsFilterRepoIds'>
): Promise<void> {
  return Promise.all([state.setAgentsVisibleHostIds(null), state.setAgentsFilterRepoIds([])]).then(
    () => undefined
  )
}
export function isActivityScopeCommand(command: ActivityViewerCommand): boolean {
  return (
    command.operation === 'origin' ||
    command.operation === 'scope-reset' ||
    command.operation === 'host-toggle' ||
    command.operation === 'hosts-toggle-all'
  )
}
export function applyActivityScopeCommand(
  command: ActivityViewerCommand,
  state: AppState
): Promise<void> | undefined {
  if (command.operation === 'origin') {
    if (command.kind === 'other-client') {
      if (!isActivityOtherClientFilterVisible(state)) {
        throw new Error('activity_origin_filter_unavailable')
      }
      return state.setAgentsHideWorkspacesFromOtherDevices(command.hidden)
    }
    return command.kind === 'cli'
      ? state.setAgentsHideCliCreatedWorkspaces(command.hidden)
      : state.setAgentsHideAutomationGeneratedWorkspaces(command.hidden)
  }
  if (command.operation === 'scope-reset') {
    return state.agentsVisibleHostIds === null && state.agentsFilterRepoIds.length === 0
      ? undefined
      : resetActivityScope(state)
  }
  if (command.operation === 'host-toggle' || command.operation === 'hosts-toggle-all') {
    const hosts = buildSidebarHostOptions({
      repos: state.repos,
      sshTargetLabels: state.sshTargetLabels,
      sshConnectionStates: state.sshConnectionStates,
      settings: state.settings,
      runtimeEnvironments: state.runtimeEnvironments,
      runtimeStatusByEnvironmentId: state.runtimeStatusByEnvironmentId,
      hostLabelOverrides: getHostDisplayLabelOverrides(state.settings)
    })
    if (!shouldShowHostScopeControls(hosts)) {
      throw new Error('activity_host_filter_unavailable')
    }
    const ids = hosts.map((host) => host.id)
    let next
    if (command.operation === 'host-toggle') {
      const host = hosts.find((host) => host.id === command.host)
      if (!host) {
        throw new Error('activity_host_unavailable')
      }
      next = getToggledHostIds(state.agentsVisibleHostIds, ids, host.id)
    } else {
      next = getToggledAllHostIds(state.agentsVisibleHostIds, ids)
    }
    return next === undefined ? undefined : state.setAgentsVisibleHostIds(next)
  }
  return undefined
}
