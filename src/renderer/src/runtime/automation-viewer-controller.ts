import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AutomationViewerAction } from '../../../shared/automation-viewer-command'
import { AutomationViewerActionSchema } from '../../../shared/automation-viewer-command'
import type { AutomationsPageLocalState } from '../components/automations/use-automations-page-local-state'
import type { AutomationsPageListState } from '../components/automations/use-automations-page-list-state'
import {
  EMPTY_AUTOMATION_LIST_FILTER,
  nextAutomationListSort
} from '../components/automations/automation-list-view'

type Page = {
  local: Pick<
    AutomationsPageLocalState,
    | 'listSearchQuery'
    | 'setListSearchQuery'
    | 'listFilter'
    | 'listSort'
    | 'setListSort'
    | 'selectedExternalKey'
    | 'selectExternalKey'
    | 'isDetailOpen'
    | 'setIsDetailOpen'
    | 'activePaneTab'
    | 'setActivePaneTab'
    | 'pageView'
    | 'setPageView'
    | 'showAutomationsList'
    | 'showRunsDashboard'
    | 'showAutomationDetails'
  >
  list: Pick<
    AutomationsPageListState,
    | 'hostCatalog'
    | 'searchSettled'
    | 'searchCounts'
    | 'selectedRow'
    | 'selectedExternal'
    | 'filteredRows'
    | 'filteredExternalAutomationEntries'
    | 'sortedListItems'
    | 'selectAutomationRow'
    | 'changeListFilter'
  >
}
function snapshot({ local, list }: Page) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    query: local.listSearchQuery,
    filter: local.listFilter,
    sort: local.listSort,
    searchSettled: list.searchSettled,
    visibleRowKeys: list.sortedListItems.map((item) => item.id),
    selectedRowKey: list.selectedRow?.key ?? null,
    selectedExternalKey: list.selectedExternal?.key ?? null,
    detailOpen: local.isDetailOpen,
    tab: local.activePaneTab,
    view: local.pageView,
    hostKeys: list.hostCatalog.entries.map((entry) => entry.stableKey)
  }
}
type ViewerState = ReturnType<typeof snapshot>
type Control = (action: AutomationViewerAction) => Promise<ViewerState>
const mountedViewers = new Set<Control>()

export async function applyAutomationViewerAction(
  action: AutomationViewerAction
): Promise<ViewerState> {
  const parsed = AutomationViewerActionSchema.parse(action)
  if (mountedViewers.size !== 1) {
    throw new Error(mountedViewers.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedViewers.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}

export function useAutomationViewerController(page: Page): void {
  const latest = useRef(page)
  const [, setRevision] = useState(0)
  useLayoutEffect(() => {
    latest.current = page
  })
  const pending = useRef<{
    action: AutomationViewerAction
    resolve: (state: ViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useEffect(() => {
    const request = pending.current
    if (!request || !page.list.searchSettled) {
      return
    }
    const state = snapshot(page)
    if (
      page.list.searchCounts.searchActive &&
      state.visibleRowKeys.length > 0 &&
      !state.visibleRowKeys.includes(state.selectedExternalKey ?? state.selectedRowKey ?? '')
    ) {
      return
    }
    pending.current = null
    const action = request.action
    if (
      (action.kind === 'query' && state.query !== action.value) ||
      (action.kind === 'select' &&
        (action.source === 'local' ? state.selectedRowKey : state.selectedExternalKey) !==
          action.rowKey)
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve(state)
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const { local, list } = latest.current
      if (action.kind === 'get') {
        return snapshot(latest.current)
      }
      if (pending.current) {
        throw new Error('viewer_busy')
      }
      if (
        action.kind === 'filter' &&
        action.value.hostStableKeys?.some(
          (key) => !list.hostCatalog.entries.some((entry) => entry.stableKey === key)
        )
      ) {
        throw new Error('automation_host_not_loaded')
      }
      if (
        action.kind === 'select' &&
        !(action.source === 'local'
          ? list.filteredRows.some((row) => row.key === action.rowKey)
          : list.filteredExternalAutomationEntries.some((entry) => entry.key === action.rowKey))
      ) {
        throw new Error('automation_row_not_visible')
      }
      return new Promise((resolve, reject) => {
        pending.current = { action, resolve, reject }
        switch (action.kind) {
          case 'navigate':
            if (action.value === 'list') {
              local.showAutomationsList()
            } else if (action.value === 'runs') {
              local.showRunsDashboard()
            } else {
              local.showAutomationDetails()
            }
            break
          case 'query':
            local.setListSearchQuery(action.value)
            break
          case 'filter':
            list.changeListFilter(action.value)
            break
          case 'filter-clear':
            list.changeListFilter(EMPTY_AUTOMATION_LIST_FILTER)
            list.hostCatalog.selectHost({ kind: 'all' })
            break
          case 'sort':
            local.setListSort(action.value)
            break
          case 'sort-next':
            local.setListSort(nextAutomationListSort(local.listSort, action.field))
            break
          case 'select':
            list.selectAutomationRow(action.source === 'local' ? action.rowKey : null)
            local.selectExternalKey(action.source === 'external' ? action.rowKey : null)
            if (action.source === 'external') {
              local.setActivePaneTab('overview')
            }
            local.setIsDetailOpen(true)
            break
          case 'detail':
            local.setIsDetailOpen(action.open)
            break
          case 'tab':
            local.setActivePaneTab(action.value)
            break
          case 'view':
            if (action.value === 'runs') {
              list.hostCatalog.selectHost({ kind: 'all' })
            }
            local.setPageView(action.value)
            break
        }
        setRevision((value) => value + 1)
      })
    }
    mountedViewers.add(control)
    return () => {
      mountedViewers.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
