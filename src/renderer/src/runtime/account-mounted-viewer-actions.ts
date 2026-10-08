import { applyMountedAccountSwitcher } from './account-mounted-switcher-controls'
import {
  AccountMountedViewerActionSchema,
  AccountMountedActionError,
  type AccountMountedViewerAction
} from '../../../shared/account-mounted-viewer-command'
import {
  applyMountedAccountDraft,
  applyMountedOpenCodeGoCommit
} from './account-mounted-draft-controls'
import { applyMountedAccountDialog } from './account-mounted-dialog-controls'

export function isAccountMountedViewerAction(input: unknown): input is AccountMountedViewerAction {
  return AccountMountedViewerActionSchema.safeParse(input).success
}

export async function applyMountedAccountsViewerAction(action: AccountMountedViewerAction) {
  try {
    if ('value' in action && new TextEncoder().encode(action.value).length > 65536) {
      throw new AccountMountedActionError('invalid_argument')
    }
    if (action.type === 'account-opencode-go-commit') {
      return await applyMountedOpenCodeGoCommit(action.operation)
    }
    if (applyMountedAccountDraft(action)) {
      return { status: 'accepted' }
    }
    if (action.type === 'account-switcher-toggle' || action.type === 'account-switcher-runtime') {
      return await applyMountedAccountSwitcher(action)
    }
    return applyMountedAccountDialog(action)
  } catch (error) {
    if (error instanceof AccountMountedActionError) {
      throw error
    }
    throw new AccountMountedActionError('failed')
  }
}
