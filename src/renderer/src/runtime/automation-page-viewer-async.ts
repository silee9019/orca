import type { AutomationViewerAction } from '../../../shared/automation-viewer-command'
import type { AutomationViewerPage, AutomationViewerState } from './automation-page-viewer-state'
import { automationHostCatalogEntryFingerprint } from '../components/automations/automation-host-catalog-generation'
import { automationHostRecoveryActions } from '../components/automations/automation-host-status-descriptors'

type RecoveryAction = Extract<AutomationViewerAction, { kind: 'host-recover' }>
export function automationViewerRecoveryTarget(page: AutomationViewerPage, action: RecoveryAction) {
  const entry = page.list.hostCatalog.entries.find((entry) => entry.stableKey === action.stableKey)
  if (!entry) {
    throw new Error('automation_host_not_loaded')
  }
  if (action.reviewedOwner !== automationHostCatalogEntryFingerprint(entry)) {
    throw new Error('viewer_target_changed')
  }
  const offered = automationHostRecoveryActions(entry)
  if (offered.authority !== action.action && offered.execution !== action.action) {
    throw new Error('automation_host_recovery_unavailable')
  }
  return entry
}

export async function performAutomationViewerAsyncAction(
  page: AutomationViewerPage,
  action: Extract<AutomationViewerAction, { kind: 'refresh' | 'host-recover' | 'editor-edit' }>
): Promise<Pick<AutomationViewerState, 'refresh' | 'recovery'>> {
  if (action.kind === 'refresh') {
    return { refresh: await page.refreshList() }
  }
  if (action.kind === 'host-recover') {
    const entry = automationViewerRecoveryTarget(page, action)
    return { recovery: await page.recoverListHost(action.action, entry) }
  }
  if (action.source === 'local') {
    const row = page.list.filteredRows.find((row) => row.key === action.rowKey)
    if (row) {
      await page.editorActions.openEditDialog(row)
    }
  } else {
    const entry = page.list.filteredExternalAutomationEntries.find(
      (entry) => entry.key === action.rowKey
    )
    if (entry) {
      page.editorActions.openEditExternalDialog(entry.manager, entry.job, entry.scope)
    }
  }
  return {}
}
