import type { AutomationManagementActions } from '../components/automations/automation-management-actions'
import type { ExternalAutomationActions } from '../components/automations/use-external-automation-actions'
import type { AutomationsPageLocalState } from '../components/automations/use-automations-page-local-state'
import type { AutomationsPageListState } from '../components/automations/use-automations-page-list-state'
import type { AutomationsPageDestinationState } from '../components/automations/use-automations-page-destination-state'
import type { AutomationDeleteDialogActions } from '../components/automations/automation-delete-dialog-actions'
import type { AutomationMutationOutcome } from '../components/automations/automation-mutation-outcome'
import {
  capturedAutomationOwner,
  capturedAutomationOwnerKey
} from '../components/automations/automation-captured-owner'
import { externalAutomationJobKey } from '../components/automations/external-automation-scope-keys'
import { ownerKey } from '../../../shared/automation-owner-key'

export type AutomationDeleteViewerPage = {
  local: Pick<
    AutomationsPageLocalState,
    | 'createOpen'
    | 'deleteTarget'
    | 'externalDeleteTarget'
    | 'dontAskDeleteAgain'
    | 'deleteConfirmButtonRef'
    | 'externalDeleteConfirmButtonRef'
    | 'externalActionKey'
    | 'deleteOperationCountRef'
  >
  list: Pick<
    AutomationsPageListState,
    'filteredRows' | 'filteredExternalAutomationEntries' | 'searchSettled'
  >
  destination: Pick<
    AutomationsPageDestinationState,
    'isAutomationRowActionEnabled' | 'automationDispatchContext' | 'automationAuthorityForRow'
  >
  managementActions: Pick<
    AutomationManagementActions,
    'requestDeleteAutomation' | 'confirmDeleteAutomation'
  >
  externalActions: Pick<
    ExternalAutomationActions,
    'requestExternalAction' | 'confirmDeleteExternalAutomation'
  >
  deleteDialogActions: AutomationDeleteDialogActions
}
export function automationDeletionTarget(page: AutomationDeleteViewerPage) {
  return page.local.deleteTarget ?? page.local.externalDeleteTarget
}
export function automationDeletionOwnerState(page: AutomationDeleteViewerPage) {
  const target = page.local.deleteTarget
  if (target) {
    const captured = target.deletionCapture.context
    const current = page.destination.automationDispatchContext
    const before = capturedAutomationOwnerKey(
      capturedAutomationOwner(captured.capturedOwners, target.key)
    )
    const after = capturedAutomationOwnerKey(
      capturedAutomationOwner(current.capturedOwners, target.key)
    )
    const authority = page.destination.automationAuthorityForRow(target)
    return {
      signature: JSON.stringify([after, authority]),
      available:
        before === after &&
        JSON.stringify(captured.authority) === JSON.stringify(authority) &&
        page.destination.isAutomationRowActionEnabled(target, 'delete')
    }
  }
  const external = page.local.externalDeleteTarget
  if (external) {
    const key = externalAutomationJobKey(external.scope, external.job.id)
    const entry = page.list.filteredExternalAutomationEntries.find((item) => item.key === key)
    return {
      signature: entry ? ownerKey(entry.scope.owner) : 'unavailable',
      available: Boolean(
        entry &&
        entry.manager.canManage &&
        ownerKey(entry.scope.owner) === ownerKey(external.scope.owner)
      )
    }
  }
  return { signature: 'closed', available: false }
}
export function automationDeletionSnapshot(
  page: AutomationDeleteViewerPage,
  reviewedTarget: string | null,
  pending: boolean,
  outcome: AutomationMutationOutcome | null
) {
  const local = page.local.deleteTarget
  const external = page.local.externalDeleteTarget
  const source = local ? ('local' as const) : external ? ('external' as const) : null
  const confirm = local
    ? page.local.deleteConfirmButtonRef
    : page.local.externalDeleteConfirmButtonRef
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    open: Boolean(local || external),
    reviewedTarget,
    source,
    rowKey:
      local?.key ?? (external ? externalAutomationJobKey(external.scope, external.job.id) : null),
    definitionId: local?.automation.id ?? external?.job.id ?? null,
    dontAskAgain: local ? page.local.dontAskDeleteAgain : false,
    ownerAvailable: automationDeletionOwnerState(page).available,
    confirmFocused: Boolean(
      (local || external) && confirm.current && document.activeElement === confirm.current
    ),
    busy:
      pending ||
      page.local.deleteOperationCountRef.current > 0 ||
      page.local.externalActionKey !== null,
    outcome
  }
}
export type AutomationDeleteViewerState = ReturnType<typeof automationDeletionSnapshot>
