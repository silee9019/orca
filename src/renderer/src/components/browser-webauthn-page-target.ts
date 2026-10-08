import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { matchesBrowserClientPageCommandTarget } from '@/runtime/browser-client-page-command-target'
import type { BrowserWebAuthnDialogTarget } from '../../../shared/rpc-contract/browser-webauthn-dialog-params'
export function matchesBrowserWebAuthnPageTarget(
  command: Omit<BrowserWebAuthnDialogTarget, 'credentialId'>
): boolean {
  const state = useAppStore.getState()
  const page = findPage(state.browserPagesByWorkspace, command.page)
  return (
    page?.worktreeId === command.worktreeId &&
    (page.browserRuntimeEnvironmentId ?? null) === command.environmentId &&
    (command.environmentId === null
      ? command.clientTarget === undefined && !state.remoteBrowserPageHandlesByPageId[command.page]
      : matchesBrowserClientPageCommandTarget(
          state.remoteBrowserPageHandlesByPageId[command.page],
          command.environmentId,
          command.clientTarget
        )) &&
    state.activeModal === 'none'
  )
}
