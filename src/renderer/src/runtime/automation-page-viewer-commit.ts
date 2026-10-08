import type { AutomationViewerAction } from '../../../shared/automation-viewer-command'
import type { AutomationViewerPage, AutomationViewerState } from './automation-page-viewer-state'
import { automationHostCatalogEntryFingerprint } from '../components/automations/automation-host-catalog-generation'
import { automationHostFilterStableKey } from '../../../shared/automation-host-filter'

export type AutomationViewerRequest = {
  action: AutomationViewerAction
  ready: boolean
  hostScope?: string
  outcome?: Pick<AutomationViewerState, 'refresh' | 'recovery'>
  resolve: (state: AutomationViewerState) => void
  reject: (error: Error) => void
}

export function automationViewerHostScope(page: AutomationViewerPage): string {
  return JSON.stringify([
    automationHostFilterStableKey(page.list.hostCatalog.resolution.effective),
    page.local.listFilter,
    page.list.hostCatalog.entries.map(automationHostCatalogEntryFingerprint)
  ])
}

export function didAutomationViewerTargetChange(
  page: AutomationViewerPage,
  action: AutomationViewerAction,
  state: AutomationViewerState
): boolean {
  return (
    ((action.kind === 'editor-create' || action.kind === 'editor-edit') && !state.editor.open) ||
    (action.kind === 'editor-edit' &&
      action.source === 'local' &&
      state.editor.rowKey !== action.rowKey) ||
    (action.kind === 'editor-edit' &&
      action.source === 'external' &&
      !page.list.filteredExternalAutomationEntries.some(
        (entry) =>
          entry.key === action.rowKey &&
          entry.job === page.local.editingExternalTarget?.job &&
          entry.manager === page.local.editingExternalTarget?.manager &&
          entry.scope === page.local.editingExternalTarget?.scope
      )) ||
    (action.kind === 'query' && state.query !== action.value) ||
    (action.kind === 'host-select' && state.hostSelection.stableKey !== action.stableKey) ||
    (action.kind === 'select' &&
      (action.source === 'local' ? state.selectedRowKey : state.selectedExternalKey) !==
        action.rowKey)
  )
}
