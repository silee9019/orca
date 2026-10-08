import { useAppStore } from '@/store'
import { useAutomationRunPageControls } from './use-automation-run-page-controls'
import { useAutomationSaveViewer } from '../../runtime/automation-save-viewer'
import { useAutomationRunNavigationViewer } from '../../runtime/automation-run-navigation-viewer'
import { capturedAutomationOwner, capturedAutomationOwnerKey } from './automation-captured-owner'
import { createAutomationListRefreshAction } from './automation-list-refresh-action'
import { createAutomationListRecoveryAction } from './automation-list-recovery-action'
import { useAutomationRowViewerController } from '../../runtime/automation-row-viewer-controller'
import { useRef } from 'react'
import type { AutomationListViewerNavigation } from './AutomationsListPanel'
import { useAutomationViewerController } from '../../runtime/automation-viewer-controller'
import { createAutomationManagementActions } from './automation-management-actions'
import { createAutomationRunActions } from './automation-run-actions'
import { createAutomationRunWorkspaceAction } from './automation-run-workspace-action'
import { createAutomationSaveAction } from './automation-save-action'
import { useAutomationDraftEffects } from './use-automation-draft-effects'
import { useAutomationEditorActions } from './use-automation-editor-actions'
import { useAutomationRunPageState } from './use-automation-run-page-state'
import { useAutomationSourceAvailability } from './use-automation-source-availability'
import { useAutomationsPageEscape } from './use-automations-page-escape'
import { useAutomationsPageListState } from './use-automations-page-list-state'
import { useAutomationsPageLocalState } from './use-automations-page-local-state'
import { useAutomationsPageDestinationState } from './use-automations-page-destination-state'
import { useAutomationsPageDestinationForm } from './use-automations-page-destination-form'
import { useAutomationsPagePresentationState } from './use-automations-page-presentation-state'
import { useAutomationsPageRefresh } from './use-automations-page-refresh'
import { useAutomationsPageSetupState } from './use-automations-page-setup-state'
import { useAutomationsPageStoreState } from './use-automations-page-store-state'
import { useExternalAutomationActions } from './use-external-automation-actions'
import { useAutomationRunsDashboard } from './use-automation-runs-dashboard'
import { createAutomationDeleteDialogActions } from './automation-delete-dialog-actions'
import { useAutomationDeleteViewerController } from '../../runtime/automation-delete-viewer-controller'

export function useAutomationsPageController() {
  const profileId = useAppStore((state) => state.activeOrcaProfileId)
  const listNavigation = useRef<AutomationListViewerNavigation | null>(null)
  const store = useAutomationsPageStoreState()
  const local = useAutomationsPageLocalState(store)
  const list = useAutomationsPageListState({ store, local })
  const destination = useAutomationsPageDestinationState({ store, local, list })
  const runsDashboard = useAutomationRunsDashboard({
    enabled: local.pageView === 'runs',
    rows: list.visibleRows,
    context: destination.automationDispatchContext,
    legacyTarget: destination.automationHostTargetFor,
    authorityForRow: destination.automationAuthorityForRow,
    reloadToken: local.runHistoryReloadToken
  })
  const destinationForm = useAutomationsPageDestinationForm({
    store,
    local,
    list,
    base: destination
  })
  const setup = useAutomationsPageSetupState({ store, local, list })
  const runPage = useAutomationRunPageState({ store, local, list, setup })
  const sourceAvailability = useAutomationSourceAvailability(list.visibleRows)
  const presentation = useAutomationsPagePresentationState({
    store,
    local,
    list,
    destination,
    destinationForm,
    sourceAvailability
  })
  const pageRefresh = useAutomationsPageRefresh({
    store,
    local,
    list,
    destination
  })
  const draftEffects = useAutomationDraftEffects({
    store,
    local,
    setup,
    destination,
    destinationForm,
    pageRefresh
  })
  const editorActions = useAutomationEditorActions({
    store,
    local,
    visibleRows: list.visibleRows,
    destination,
    destinationForm
  })
  const saveAutomation = createAutomationSaveAction({
    store,
    local,
    list,
    setup,
    destination,
    destinationForm,
    pageRefresh
  })
  const createResolution = destination.createDestination.control.resolution
  const editResolution = destinationForm.editHostResolution
  useAutomationSaveViewer({
    open: local.createOpen,
    saving: local.isSaving,
    canSave: presentation.canSaveDraft,
    draft: local.draft,
    createTarget: local.createTarget,
    ownerKey: JSON.stringify([
      local.editingRowKey,
      local.editingDestination?.projectId,
      local.editingDestination?.destination.authority,
      local.editingDestination?.destination.destination,
      capturedAutomationOwnerKey(
        capturedAutomationOwner(
          destination.automationDispatchContext.capturedOwners,
          local.editingRowKey ?? ''
        )
      ),
      local.editingExternalTarget?.scope,
      editResolution.status === 'ready'
        ? [editResolution.authority, editResolution.destination]
        : editResolution,
      createResolution.status === 'ready'
        ? [createResolution.authority, createResolution.destination]
        : createResolution
    ]),
    onSave: saveAutomation
  })
  const actionContext = {
    store,
    local,
    list,
    setup,
    destination,
    destinationForm,
    sourceAvailability,
    presentation,
    pageRefresh
  }
  const managementActions = createAutomationManagementActions(actionContext)
  const runActions = createAutomationRunActions(actionContext)
  const externalActions = useExternalAutomationActions(actionContext)
  const deleteDialogActions = createAutomationDeleteDialogActions(local)
  useAutomationDeleteViewerController({
    local,
    list,
    destination,
    managementActions,
    externalActions,
    deleteDialogActions
  })
  useAutomationRowViewerController({
    local,
    list,
    destination,
    managementActions,
    runActions,
    externalActions,
    profileId,
    modalOpen: store.activeModal !== 'none'
  })
  const refreshList = createAutomationListRefreshAction(list.hostCatalog, pageRefresh)
  const recoverListHost = createAutomationListRecoveryAction(list.hostCatalog, pageRefresh)
  useAutomationViewerController({
    local,
    list,
    listNavigation,
    editorActions,
    destination,
    refreshList,
    recoverListHost
  })
  const runOwnerKeys = new Map(
    list.visibleRows.map((row) => [
      row.key,
      JSON.stringify([
        row.catalogRef,
        destination.automationAuthorityForRow(row),
        capturedAutomationOwnerKey(
          capturedAutomationOwner(destination.automationDispatchContext.capturedOwners, row.key)
        )
      ])
    ])
  )
  useAutomationRunNavigationViewer({
    ownerKeys: runOwnerKeys,
    profileId,
    selectedAutomationId: list.selectedRow?.automation.id ?? null,
    view: local.pageView,
    origin: local.runPageOrigin,
    selectedRowKey: list.selectedRow?.key ?? null,
    selectedRunId: setup.selectedAutomationRunPage?.id ?? null,
    pendingRunId: store.pendingAutomationRunNavigation?.runId ?? null,
    detailOpen: local.isDetailOpen
  })
  const openRunWorkspace = createAutomationRunWorkspaceAction(actionContext)
  const runPageControls = useAutomationRunPageControls({
    local,
    list,
    destination,
    setup,
    runPage,
    runActions,
    openRunWorkspace
  })
  useAutomationsPageEscape({ store, local })

  return {
    listNavigation,
    store,
    local,
    list,
    destination,
    runsDashboard,
    destinationForm,
    setup,
    runPage,
    sourceAvailability,
    presentation,
    pageRefresh,
    refreshList,
    recoverListHost,
    draftEffects,
    editorActions,
    saveAutomation,
    managementActions,
    runActions,
    externalActions,
    deleteDialogActions,
    openRunWorkspace,
    runPageControls,
    runOwnerKeys
  }
}

export type AutomationsPageController = ReturnType<typeof useAutomationsPageController>
