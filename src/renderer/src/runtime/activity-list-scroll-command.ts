import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { readActivityGroupCollapseControl, readActivityViewerView } from './activity-viewer-view'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { readActivityScope, sameActivityScope } from './activity-scope-preferences'

export async function applyActivityListScrollRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'scroll' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const initial = useAppStore.getState()
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const scope = readActivityScope(initial)
  const view = readActivityViewerView(command.surface)
  const control = readActivityGroupCollapseControl(command.surface)
  const root = document.querySelector<HTMLElement>(`[data-activity-viewer="${command.surface}"]`)
  const list = root?.querySelector<HTMLElement>('[data-activity-virtual-list]')
  const scroll = list?.parentElement
  if (
    !view ||
    !control ||
    !root ||
    !list ||
    !scroll ||
    !view.querySettled ||
    !sameActivityScope(view.scope, scope) ||
    view.runtimeContextKey !== runtime ||
    (command.surface === 'activity-page'
      ? initial.activeView !== 'activity'
      : !initial.sidebarOpen || initial.sidebarBody !== 'agents') ||
    !isActivityDestinationVisible(root) ||
    !isActivityDestinationVisible(scroll) ||
    !Number.isFinite(scroll.scrollHeight) ||
    !Number.isFinite(scroll.clientHeight) ||
    scroll.clientHeight <= 0
  ) {
    throw new Error('activity_scroll_unavailable')
  }
  const targetTop = Math.min(command.top, Math.max(0, scroll.scrollHeight - scroll.clientHeight))
  const initialView = initial.activeView
  const initialWorkspace = initial.activeWorktreeId
  let superseded = false
  let observed = Math.abs(scroll.scrollTop - targetTop) < 1
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const observe = (): void => {
    const state = useAppStore.getState()
    if (
      !sameRuntime() ||
      state.activeView !== initialView ||
      state.activeWorktreeId !== initialWorkspace ||
      state.agentsGroupBy !== view.groupBy ||
      state.agentsReadFilter !== view.readFilter ||
      state.agentsCompactMode !== view.compact ||
      state.agentsShowChildAgents !== view.showChildAgents ||
      !sameActivityScope(readActivityScope(state), scope) ||
      (command.surface === 'sidebar-agents' &&
        (!state.sidebarOpen || state.sidebarBody !== 'agents'))
    ) {
      superseded = true
    }
  }
  const stillExpected = (): boolean => {
    const current = readActivityViewerView(command.surface)
    const collapse = readActivityGroupCollapseControl(command.surface)
    return (
      !superseded &&
      sameRuntime() &&
      current !== null &&
      current.runtimeContextKey === runtime &&
      sameActivityScope(current.scope, scope) &&
      current.query === view.query &&
      current.groupBy === view.groupBy &&
      current.readFilter === view.readFilter &&
      current.compact === view.compact &&
      current.showChildAgents === view.showChildAgents &&
      collapse?.queryRevision === control.queryRevision &&
      collapse?.collapsedKeys === control.collapsedKeys &&
      current.logicalRows.length === view.logicalRows.length &&
      current.logicalRows.every((row, index) => {
        const previous = view.logicalRows[index]
        return (
          previous !== undefined &&
          row.key === previous.key &&
          row.kind === previous.kind &&
          row.workspaceId === previous.workspaceId &&
          row.hostId === previous.hostId
        )
      }) &&
      document.querySelector(`[data-activity-viewer="${command.surface}"]`) === root &&
      root.querySelector('[data-activity-virtual-list]') === list &&
      list.parentElement === scroll &&
      isActivityDestinationVisible(root) &&
      isActivityDestinationVisible(scroll)
    )
  }
  const visibleRowKeys = (): string[] => {
    if (!stillExpected()) {
      return []
    }
    const bounds = scroll.getBoundingClientRect()
    const sticky = root
      .querySelector<HTMLElement>('[data-activity-sticky-header-active]')
      ?.getBoundingClientRect()
    const top = sticky ? Math.max(bounds.top, Math.min(sticky.bottom, bounds.bottom)) : bounds.top
    const keys = new Set(
      view.logicalRows.filter((row) => row.kind === 'thread').map((row) => row.key)
    )
    return [...root.querySelectorAll<HTMLElement>('[data-activity-viewer-thread]')].flatMap(
      (row) => {
        const key = row.dataset.activityViewerThread
        const rect = row.getBoundingClientRect()
        return key &&
          keys.has(key) &&
          isActivityDestinationVisible(row) &&
          rect.bottom > top &&
          rect.top < bounds.bottom &&
          rect.right > bounds.left &&
          rect.left < bounds.right
          ? [key]
          : []
      }
    )
  }
  const matches = (): boolean =>
    observed &&
    stillExpected() &&
    readActivityViewerView(command.surface)?.querySettled === true &&
    Math.abs(scroll.scrollTop - targetTop) < 1 &&
    (view.logicalRows.every((row) => row.kind !== 'thread') || visibleRowKeys().length > 0)
  const onScroll = (): void => {
    if (Math.abs(scroll.scrollTop - targetTop) < 1) {
      observed = true
    } else if (observed) {
      superseded = true
    }
  }
  const unsubscribe = useAppStore.subscribe(observe)
  scroll.addEventListener('scroll', onScroll)
  try {
    scroll.scrollTo({ top: targetTop, behavior: 'instant' })
    observe()
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    while (stillExpected() && !matches() && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const applied = Date.now() < request.expiresAt && matches()
    const available = stillExpected()
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
      scrollAction: {
        requestedTop: command.top,
        targetTop,
        scrollTop: available ? scroll.scrollTop : null,
        clientHeight: available ? scroll.clientHeight : null,
        scrollHeight: available ? scroll.scrollHeight : null,
        visibleRowKeys: visibleRowKeys()
      },
      ...(!sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !available
          ? { reason: 'viewer_surface_superseded' as const }
          : !applied
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    scroll.removeEventListener('scroll', onScroll)
    unsubscribe()
  }
}
