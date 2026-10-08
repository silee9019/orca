import { AccountMountedActionError } from '../../../shared/account-mounted-viewer-command'
import { useLayoutEffect } from 'react'
import { getProviderAccountRuntime } from '../components/settings/provider-account-visibility'
import type { AccountsPaneSectionModel } from '../components/settings/accounts-pane-types'
import {
  registerProviderRemovalDialogControls,
  registerDataRemovalDialogControls,
  registerOrcaSignOutDialogControls,
  registerOnboardingYoloDraftControls,
  type DataRemovalDialogControls,
  type OrcaSignOutDialogControls,
  type OnboardingYoloDraftControls
} from './account-mounted-dialog-controls'

export function useMountedProviderRemovalDialogControls(model: AccountsPaneSectionModel) {
  useLayoutEffect(
    () =>
      registerProviderRemovalDialogControls({
        claude: (id) => {
          if (id === null) {
            model.setRemoveClaudeTarget(null)
            return
          }
          const account = model.visibleClaudeAccounts.find((entry) => entry.id === id)
          if (!account) {
            throw new AccountMountedActionError('unavailable')
          }
          if (model.claudeAction !== 'idle' || model.accountRuntimeUnavailable) {
            throw new AccountMountedActionError('busy')
          }
          model.setRemoveClaudeTarget({ id, runtime: getProviderAccountRuntime(account) })
        },
        codex: (id) => {
          if (id === null) {
            model.setRemoveCodexTarget(null)
            return
          }
          const account = model.visibleCodexAccounts.find((entry) => entry.id === id)
          if (!account) {
            throw new AccountMountedActionError('unavailable')
          }
          if (model.codexAction !== 'idle' || model.accountRuntimeUnavailable) {
            throw new AccountMountedActionError('busy')
          }
          model.setRemoveCodexTarget({ id, runtime: getProviderAccountRuntime(account) })
        }
      }),
    [model]
  )
}
export function useMountedDataRemovalDialogControls(
  provider: 'opencode' | 'devin',
  controls: DataRemovalDialogControls
) {
  useLayoutEffect(() => registerDataRemovalDialogControls(provider, controls), [provider, controls])
}
export function useMountedOrcaSignOutDialogControls(controls: OrcaSignOutDialogControls) {
  useLayoutEffect(() => registerOrcaSignOutDialogControls(controls), [controls])
}
export function useMountedOnboardingYoloDraftControls(
  controls: OnboardingYoloDraftControls | null
) {
  useLayoutEffect(
    () => (controls ? registerOnboardingYoloDraftControls(controls) : undefined),
    [controls]
  )
}
