import React from 'react'
import { AutomationDeleteDialog, ExternalAutomationDeleteDialog } from './AutomationDeleteDialogs'
import type { AutomationsPageController } from './use-automations-page-controller'

type Props = {
  controller: Pick<
    AutomationsPageController,
    'local' | 'managementActions' | 'externalActions' | 'deleteDialogActions'
  >
}

export function AutomationsPageDeleteDialogs({ controller }: Props): React.JSX.Element {
  const { local, managementActions, externalActions, deleteDialogActions } = controller
  return (
    <>
      <AutomationDeleteDialog
        deleteTarget={local.deleteTarget?.automation ?? null}
        dontAskDeleteAgain={local.dontAskDeleteAgain}
        confirmButtonRef={local.deleteConfirmButtonRef}
        onOpenChange={(open) => {
          if (!open) {
            deleteDialogActions.cancelLocal()
          }
        }}
        onDontAskAgainToggle={deleteDialogActions.togglePreference}
        onCancel={deleteDialogActions.cancelLocal}
        onConfirm={() => void managementActions.confirmDeleteAutomation()}
      />
      <ExternalAutomationDeleteDialog
        externalDeleteTarget={local.externalDeleteTarget}
        confirmButtonRef={local.externalDeleteConfirmButtonRef}
        onOpenChange={(open) => {
          if (!open) {
            deleteDialogActions.cancelExternal()
          }
        }}
        onCancel={deleteDialogActions.cancelExternal}
        onConfirm={() => void externalActions.confirmDeleteExternalAutomation()}
      />
    </>
  )
}
