import type { RefObject } from 'react'
import type { AutomationsPageLocalState } from './use-automations-page-local-state'

export function focusAutomationDeleteConfirm(ref: RefObject<HTMLButtonElement | null>): void {
  ref.current?.focus()
}

export function createAutomationDeleteDialogActions(
  local: Pick<
    AutomationsPageLocalState,
    | 'setDeleteTarget'
    | 'setDontAskDeleteAgain'
    | 'dontAskDeleteAgain'
    | 'setExternalDeleteTarget'
    | 'deleteConfirmButtonRef'
    | 'externalDeleteConfirmButtonRef'
  >
) {
  return {
    cancelLocal: (): void => {
      local.setDeleteTarget(null)
      local.setDontAskDeleteAgain(false)
    },
    togglePreference: (): void => local.setDontAskDeleteAgain(!local.dontAskDeleteAgain),
    cancelExternal: (): void => local.setExternalDeleteTarget(null),
    focusLocal: (): void => focusAutomationDeleteConfirm(local.deleteConfirmButtonRef),
    focusExternal: (): void => focusAutomationDeleteConfirm(local.externalDeleteConfirmButtonRef)
  }
}
export type AutomationDeleteDialogActions = ReturnType<typeof createAutomationDeleteDialogActions>
