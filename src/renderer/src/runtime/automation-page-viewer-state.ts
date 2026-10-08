import { getAutomationTemplates } from '../components/automations/automation-templates'
import {
  automationContentSnapshot,
  type AutomationContentViewerState
} from './automation-content-viewer'
import {
  automationOwnerNoticeSnapshot,
  type AutomationOwnerNoticeViewerState
} from './automation-owner-notice-viewer'
import {
  automationHistoryViewerSnapshot,
  type AutomationHistoryViewerState
} from './automation-history-viewer'
import {
  externalAutomationRunTablesSnapshot,
  type ExternalAutomationRunTableViewerState
} from './external-automation-run-table-viewer'
import {
  automationRunPageViewerSnapshot,
  type AutomationRunPageViewerState
} from './automation-run-page-viewer'
import {
  automationSaveReviewSnapshot,
  type AutomationSaveViewerResult
} from './automation-save-viewer'
import { automationRunNavigationSnapshot } from './automation-run-navigation-viewer'
import { automationRowViewerSnapshot } from './automation-row-viewer-controller'
import { automationRunsViewerSnapshot } from './automation-runs-viewer-controller'
import type { AutomationRunsViewerState } from './automation-runs-viewer-state'
import type { AutomationRowViewerState } from './automation-row-viewer-state'
import type { RefObject } from 'react'
import type { AutomationListRefreshOutcome } from '../components/automations/automation-list-refresh-action'
import type {
  createAutomationListRecoveryAction,
  AutomationListRecoveryOutcome
} from '../components/automations/automation-list-recovery-action'
import { automationHostCatalogEntryFingerprint } from '../components/automations/automation-host-catalog-generation'
import { automationHostRecoveryActions } from '../components/automations/automation-host-status-descriptors'
import { automationHostFilterStableKey } from '../../../shared/automation-host-filter'
import type { AutomationEditorViewerState } from './automation-editor-viewer-controller'
import { automationDeleteViewerSnapshot } from './automation-delete-viewer-controller'
import type { AutomationListViewerNavigation } from '../components/automations/AutomationsListPanel'
import type { AutomationsPageLocalState } from '../components/automations/use-automations-page-local-state'
import type { AutomationsPageListState } from '../components/automations/use-automations-page-list-state'
import type { AutomationEditorActions } from '../components/automations/use-automation-editor-actions'
import type { AutomationsPageDestinationState } from '../components/automations/use-automations-page-destination-state'

export type AutomationViewerPage = {
  refreshList: () => Promise<AutomationListRefreshOutcome>
  recoverListHost: ReturnType<typeof createAutomationListRecoveryAction>
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
    templates: getAutomationTemplates(),
    ownerNotice: automationOwnerNoticeSnapshot(),
    contentDisclosures: automationContentSnapshot(),
    committed: true as const,
    deletion: automationDeleteViewerSnapshot(),
    rowActions: automationRowViewerSnapshot(),
    runs: automationRunsViewerSnapshot(),
    runNavigation: automationRunNavigationSnapshot(),
    history: automationHistoryViewerSnapshot(),
    runPage: automationRunPageViewerSnapshot(),
    externalRunTables: externalAutomationRunTablesSnapshot(),
    saveReview: automationSaveReviewSnapshot(),
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
    hostSelection: {
      stableKey: automationHostFilterStableKey(list.hostCatalog.resolution.effective),
      status: list.hostCatalog.resolution.status,
      announceFallback: list.hostCatalog.resolution.announceFallback
    },
    hostLoadCounts: list.hostCatalog.loadCounts,
    hosts: list.hostCatalog.entries.map((entry) => ({
      stableKey: entry.stableKey,
      reviewedOwner: automationHostCatalogEntryFingerprint(entry),
      recovery: automationHostRecoveryActions(entry),
      label: entry.label,
      catalogState: entry.catalogState,
      authorityHealth: entry.authorityHealth,
      executionHealth: entry.executionHealth,
      querySupport: entry.querySupport
    })),
    hostKeys: list.hostCatalog.entries.map((entry) => entry.stableKey)
  }
}
export type AutomationViewerState = Omit<
  ReturnType<typeof automationViewerSnapshot>,
  'committed'
> & {
  committed: boolean
  refresh?: AutomationListRefreshOutcome
  save?: AutomationSaveViewerResult
  recovery?: AutomationListRecoveryOutcome
  rowForm?: AutomationRowViewerState
  contentDisclosure?: AutomationContentViewerState
  ownerNoticeResult?: AutomationOwnerNoticeViewerState
  historyRecovery?: AutomationHistoryViewerState
  externalRunsForm?: ExternalAutomationRunTableViewerState
  runPageForm?: AutomationRunPageViewerState
  runsForm?: AutomationRunsViewerState
  editorForm?: AutomationEditorViewerState
}
