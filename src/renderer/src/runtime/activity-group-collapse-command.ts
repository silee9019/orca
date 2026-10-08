import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { getActivityVirtualItemKey } from '@/components/activity/activity-thread-virtual-items'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { readActivityGroupCollapseControl, readActivityViewerView } from './activity-viewer-view'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { readActivityScope, sameActivityScope } from './activity-scope-preferences'

export async function applyActivityGroupCollapseRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'group-toggle' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const initial = useAppStore.getState()
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const view = readActivityViewerView(command.surface)
  const control = readActivityGroupCollapseControl(command.surface)
  const root = document.querySelector<HTMLElement>(`[data-activity-viewer="${command.surface}"]`)
  if (
    !view ||
    !control ||
    !root ||
    !isActivityDestinationVisible(root) ||
    view.runtimeContextKey !== runtime ||
    !view.querySettled ||
    view.groupBy === 'none'
  ) {
    throw new Error('activity_group_control_unavailable')
  }
  const group = control.groups.find((candidate) => candidate.key === command.groupKey)
  if (!group) {
    throw new Error('activity_group_unavailable')
  }
  const initialScope = readActivityScope(initial)
  let superseded = false
  const expectedCollapsed = !control.collapsedKeys.has(group.key)
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const stillExpected = (): boolean => {
    const current = readActivityViewerView(command.surface)
    return (
      !superseded &&
      sameRuntime() &&
      isActivityDestinationVisible(root) &&
      current !== null &&
      document.querySelector(`[data-activity-viewer="${command.surface}"]`) === root &&
      current.runtimeContextKey === runtime &&
      current.groupBy === view.groupBy &&
      current.readFilter === view.readFilter &&
      current.query === view.query &&
      current.showChildAgents === view.showChildAgents &&
      current.compact === view.compact &&
      (current.scope && view.scope
        ? sameActivityScope(current.scope, view.scope)
        : current.scope === view.scope) &&
      readActivityGroupCollapseControl(command.surface)?.queryRevision === control.queryRevision &&
      readActivityGroupCollapseControl(command.surface)?.groups.some(
        (candidate) => candidate.key === group.key
      ) === true
    )
  }
  const matches = (): boolean => {
    const current = readActivityViewerView(command.surface)
    const liveControl = readActivityGroupCollapseControl(command.surface)
    if (
      !stillExpected() ||
      !current?.querySettled ||
      liveControl?.collapsedKeys.has(group.key) !== expectedCollapsed
    ) {
      return false
    }
    const header = [...root.querySelectorAll<HTMLElement>('[data-activity-sticky-header]')].find(
      (element) =>
        element.dataset.activityStickyHeader === group.key && isActivityDestinationVisible(element)
    )
    if (
      header?.querySelector('[role="button"]')?.getAttribute('aria-expanded') !==
      String(!expectedCollapsed)
    ) {
      return false
    }
    return group.threads.every(
      (thread) =>
        current.logicalRows.some(
          (row) =>
            row.key === getActivityVirtualItemKey({ type: 'thread', thread, groupKey: group.key })
        ) !== expectedCollapsed
    )
  }
  const unsubscribe = useAppStore.subscribe(() => {
    const state = useAppStore.getState()
    if (
      !sameRuntime() ||
      state.agentsGroupBy !== view.groupBy ||
      state.agentsReadFilter !== view.readFilter ||
      state.agentsCompactMode !== view.compact ||
      state.agentsShowChildAgents !== view.showChildAgents ||
      !sameActivityScope(readActivityScope(state), initialScope)
    ) {
      superseded = true
    }
  })
  try {
    control.toggle(group.key)
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    while (stillExpected() && !matches() && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const applied = Date.now() < request.expiresAt && matches()
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
      groupAction: {
        key: group.key,
        requestedCollapsed: expectedCollapsed,
        currentCollapsed: sameRuntime()
          ? (readActivityGroupCollapseControl(command.surface)?.collapsedKeys.has(group.key) ??
            null)
          : null
      },
      ...(!sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !stillExpected()
          ? { reason: 'viewer_surface_superseded' as const }
          : !applied
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    unsubscribe()
  }
}
