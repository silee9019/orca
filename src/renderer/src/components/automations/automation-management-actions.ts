import { deleteAutomationForTarget, updateAutomationForTarget } from './automation-host-client'
import {
  dispatchAutomationDelete,
  dispatchAutomationUpdate
} from './automation-row-action-dispatch'
import { persistSkipDeleteAutomationConfirm } from './automation-delete-confirm-preference'
import type { AutomationListRow } from './automation-list-row-identity'
import type { AutomationsPageActionContext } from './automations-page-action-context'
import {
  captureAutomationDeleteTarget,
  type AutomationDeleteTarget
} from './automation-delete-target'
import {
  finishAutomationMutation,
  type AutomationMutationOutcome
} from './automation-mutation-outcome'

/** Fenced toggle/delete handlers and the confirmation preference flow. */
export function createAutomationManagementActions({
  store,
  local,
  destination,
  pageRefresh
}: AutomationsPageActionContext) {
  const { updateSettings, openSettingsPage, openSettingsTarget, settings } = store
  const {
    selectAutomationId,
    selectedRowKeyRef,
    setSelectedAutomationRunPageId,
    setActivePaneTab,
    setIsDetailOpen,
    setDontAskDeleteAgain,
    setDeleteTarget,
    deleteTarget,
    dontAskDeleteAgain,
    deleteOperationCountRef,
    setDeleteOperationCount
  } = local
  const {
    automationHostTargetFor,
    automationAuthorityForRow,
    automationDispatchContext,
    reportOwnerAction,
    invalidateRowHost
  } = destination

  const toggleAutomation = async (row: AutomationListRow): Promise<AutomationMutationOutcome> => {
    const result = await dispatchAutomationUpdate(
      automationDispatchContext,
      { rowKey: row.key, automationId: row.automation.id },
      { enabled: !row.automation.enabled },
      () =>
        updateAutomationForTarget(
          row.automation,
          { enabled: !row.automation.enabled },
          automationHostTargetFor(row)
        )
    )
    reportOwnerAction(row.key, result.ok ? null : result.notice)
    if (result.ok) {
      invalidateRowHost(row.key, 'definition')
    }
    return finishAutomationMutation(result, pageRefresh.refresh)
  }

  const deleteAutomation = async (
    row: AutomationListRow,
    captured?: AutomationDeleteTarget['deletionCapture']
  ): Promise<AutomationMutationOutcome> => {
    deleteOperationCountRef.current += 1
    setDeleteOperationCount(deleteOperationCountRef.current)
    try {
      const result = await dispatchAutomationDelete(
        captured ? captured.context : automationDispatchContext,
        { rowKey: row.key, automationId: row.automation.id },
        () =>
          deleteAutomationForTarget(
            row.automation,
            captured ? captured.legacyTarget : automationHostTargetFor(row)
          )
      )
      reportOwnerAction(row.key, result.ok ? null : result.notice)
      if (result.ok) {
        if (selectedRowKeyRef.current === row.key) {
          selectAutomationId(null)
          setIsDetailOpen(false)
          setSelectedAutomationRunPageId(null)
          setActivePaneTab('overview')
        }
        invalidateRowHost(row.key, 'definition')
      }
      return await finishAutomationMutation(result, pageRefresh.refresh)
    } finally {
      deleteOperationCountRef.current -= 1
      setDeleteOperationCount(deleteOperationCountRef.current)
    }
  }

  const persistDeleteAutomationPreference = (): void => {
    persistSkipDeleteAutomationConfirm({ updateSettings, openSettingsPage, openSettingsTarget })
  }

  const requestDeleteAutomation = (
    row: AutomationListRow
  ): Promise<AutomationMutationOutcome> | null => {
    const target = captureAutomationDeleteTarget(
      row,
      automationDispatchContext,
      automationAuthorityForRow(row),
      automationHostTargetFor(row)
    )
    if (settings?.skipDeleteAutomationConfirm) {
      return deleteAutomation(target, target.deletionCapture)
    }
    setDontAskDeleteAgain(false)
    setDeleteTarget(target)
    return null
  }
  const confirmDeleteAutomation = async (): Promise<AutomationMutationOutcome | null> => {
    if (!deleteTarget) {
      return null
    }
    if (dontAskDeleteAgain) {
      persistDeleteAutomationPreference()
    }
    const target = deleteTarget
    setDeleteTarget(null)
    setDontAskDeleteAgain(false)
    return await deleteAutomation(target, target.deletionCapture)
  }

  return { toggleAutomation, deleteAutomation, requestDeleteAutomation, confirmDeleteAutomation }
}

export type AutomationManagementActions = ReturnType<typeof createAutomationManagementActions>
