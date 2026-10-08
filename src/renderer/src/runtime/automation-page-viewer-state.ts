import type { RefObject } from 'react'
import type { AutomationEditorViewerState } from './automation-editor-viewer-controller'
import type { AutomationListViewerNavigation } from '../components/automations/AutomationsListPanel'
import type { AutomationsPageLocalState } from '../components/automations/use-automations-page-local-state'
import type { AutomationsPageListState } from '../components/automations/use-automations-page-list-state'
import type { AutomationEditorActions } from '../components/automations/use-automation-editor-actions'
import type { AutomationsPageDestinationState } from '../components/automations/use-automations-page-destination-state'

export type AutomationViewerPage = {
  editorActions: Pick<
    AutomationEditorActions,
    'openCreateDialog' | 'openEditDialog' | 'openEditExternalDialog'
  >
  destination: Pick<
    AutomationsPageDestinationState,
    'canCreateAutomation' | 'isAutomationRowActionEnabled'
  >
  listNavigation: RefObject<AutomationListViewerNavigation | null>
  local: Pick<
    AutomationsPageLocalState,
    | 'createOpen'
    | 'createTarget'
    | 'editingAutomationId'
    | 'editingRowKey'
    | 'editingExternalTarget'
    | 'externalActionKey'
    | 'deleteTarget'
    | 'externalDeleteTarget'
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
export function automationViewerSnapshot({ local, list }: AutomationViewerPage) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    modalOpen: Boolean(local.createOpen || local.deleteTarget || local.externalDeleteTarget),
    editor: {
      open: local.createOpen,
      target: local.createTarget,
      rowKey: local.editingAutomationId !== null ? local.editingRowKey : null,
      automationId: local.editingAutomationId,
      externalJobId: local.editingExternalTarget?.job.id ?? null
    },
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
export type AutomationViewerState = ReturnType<typeof automationViewerSnapshot> & {
  editorForm?: AutomationEditorViewerState
}
