import type { useExternalAutomationActions } from '../components/automations/use-external-automation-actions'
import { externalAutomationRowViewerRows } from './automation-row-viewer-target'
import type { AutomationsPageLocalState } from '../components/automations/use-automations-page-local-state'
import type { AutomationsPageListState } from '../components/automations/use-automations-page-list-state'
import type { AutomationsPageDestinationState } from '../components/automations/use-automations-page-destination-state'
import type { AutomationManagementActions } from '../components/automations/automation-management-actions'
import type { AutomationRunActions } from '../components/automations/automation-run-actions'
import type { AutomationListRow } from '../components/automations/automation-list-row-identity'
import type { AutomationMutationOutcome } from '../components/automations/automation-mutation-outcome'
import {
  capturedAutomationOwner,
  capturedAutomationOwnerKey
} from '../components/automations/automation-captured-owner'

export type AutomationRowViewerPage = {
  profileId?: string | null
  modalOpen?: boolean
  externalActions?: Pick<ReturnType<typeof useExternalAutomationActions>, 'runExternalAction'>
  local: Pick<AutomationsPageLocalState, 'createOpen' | 'deleteTarget' | 'externalDeleteTarget'> &
    Partial<Pick<AutomationsPageLocalState, 'externalActionKey'>>
  list: Pick<AutomationsPageListState, 'filteredRows' | 'searchSettled'> &
    Partial<Pick<AutomationsPageListState, 'filteredExternalAutomationEntries'>>
  destination: Pick<
    AutomationsPageDestinationState,
    'isAutomationRowActionEnabled' | 'automationDispatchContext' | 'automationAuthorityForRow'
  >
  managementActions: Pick<AutomationManagementActions, 'toggleAutomation'>
  runActions: Pick<AutomationRunActions, 'runNow'>
}
export function automationRowViewerOwner(
  page: AutomationRowViewerPage,
  row: AutomationListRow
): string {
  return JSON.stringify([
    capturedAutomationOwnerKey(
      capturedAutomationOwner(page.destination.automationDispatchContext.capturedOwners, row.key)
    ),
    page.destination.automationAuthorityForRow(row)
  ])
}
export function automationRowViewerScope(page: AutomationRowViewerPage): string {
  return JSON.stringify([
    page.profileId,
    page.modalOpen,
    externalAutomationRowViewerRows(page),
    page.list.searchSettled,
    page.local.createOpen,
    Boolean(page.local.deleteTarget || page.local.externalDeleteTarget),
    page.list.filteredRows.map((row) => [
      row.key,
      row.automation,
      automationRowViewerOwner(page, row),
      page.destination.isAutomationRowActionEnabled(row, 'run'),
      page.destination.isAutomationRowActionEnabled(row, 'toggle')
    ])
  ])
}
export function automationRowViewerSnapshot(
  page: AutomationRowViewerPage,
  reviewedTarget: string,
  busy: boolean,
  lastRowKey: string | null,
  outcome: AutomationMutationOutcome | null
) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    reviewedTarget,
    busy,
    ready: page.list.searchSettled,
    modalOpen: Boolean(
      page.local.createOpen || page.local.deleteTarget || page.local.externalDeleteTarget
    ),
    externalRows: externalAutomationRowViewerRows(page),
    rows: page.list.filteredRows.map((row) => ({
      rowKey: row.key,
      definition: row.automation,
      ownerAllowsRun: page.destination.isAutomationRowActionEnabled(row, 'run'),
      ownerAllowsToggle: page.destination.isAutomationRowActionEnabled(row, 'toggle')
    })),
    lastRowKey,
    outcome
  }
}
export type AutomationRowViewerState = ReturnType<typeof automationRowViewerSnapshot>
