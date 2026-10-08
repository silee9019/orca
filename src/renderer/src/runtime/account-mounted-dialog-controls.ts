import { AccountMountedActionError } from '../../../shared/account-mounted-viewer-command'
import type { AccountMountedViewerAction } from '../../../shared/account-mounted-viewer-command'
import { requireSingleMountedAccountControls } from './account-mounted-draft-controls'

export type ProviderRemovalDialogControls = {
  claude: (id: string | null) => void
  codex: (id: string | null) => void
}
export type DataRemovalDialogControls = { set: (id: string | null) => void }
export type BitbucketDialogControls = {
  setOpen: (open: boolean) => void
  outsideDismiss: () => { prevented: boolean }
}
export type OrcaSignOutDialogControls = { setOpen: (open: boolean) => void }
export type OnboardingYoloDraftControls = { set: (enabled: boolean) => void }
const providers = new Set<ProviderRemovalDialogControls>()
const opencode = new Set<DataRemovalDialogControls>()
const devin = new Set<DataRemovalDialogControls>()
const bitbucket = new Set<BitbucketDialogControls>()
const orcaSignOut = new Set<OrcaSignOutDialogControls>()
const onboarding = new Set<OnboardingYoloDraftControls>()

export function registerProviderRemovalDialogControls(controls: ProviderRemovalDialogControls) {
  providers.add(controls)
  return () => {
    providers.delete(controls)
  }
}
export function registerDataRemovalDialogControls(
  provider: 'opencode' | 'devin',
  controls: DataRemovalDialogControls
) {
  const entries = provider === 'opencode' ? opencode : devin
  entries.add(controls)
  return () => {
    entries.delete(controls)
  }
}
export function registerBitbucketDialogControls(controls: BitbucketDialogControls) {
  bitbucket.add(controls)
  return () => {
    bitbucket.delete(controls)
  }
}
export function registerOrcaSignOutDialogControls(controls: OrcaSignOutDialogControls) {
  orcaSignOut.add(controls)
  return () => {
    orcaSignOut.delete(controls)
  }
}
export function registerOnboardingYoloDraftControls(controls: OnboardingYoloDraftControls) {
  onboarding.add(controls)
  return () => {
    onboarding.delete(controls)
  }
}

export function applyMountedAccountDialog(action: AccountMountedViewerAction) {
  switch (action.type) {
    case 'account-removal-dialog': {
      if (action.provider === 'claude' || action.provider === 'codex') {
        const controls = requireSingleMountedAccountControls(providers)
        if (action.provider === 'claude') {
          controls.claude(action.accountId)
        } else {
          controls.codex(action.accountId)
        }
      } else {
        requireSingleMountedAccountControls(action.provider === 'opencode' ? opencode : devin).set(
          action.accountId
        )
      }
      return { status: 'accepted' }
    }
    case 'account-bitbucket-dialog':
      requireSingleMountedAccountControls(bitbucket).setOpen(action.open)
      return { status: 'accepted' }
    case 'account-bitbucket-outside-dismiss':
      return requireSingleMountedAccountControls(bitbucket).outsideDismiss()
    case 'account-orca-signout-dialog':
      requireSingleMountedAccountControls(orcaSignOut).setOpen(action.open)
      return { status: 'accepted' }
    case 'account-onboarding-yolo-draft':
      requireSingleMountedAccountControls(onboarding).set(action.enabled)
      return { status: 'accepted' }
    case 'account-agent-env-draft':
    case 'account-bitbucket-draft':
    case 'account-minimax-draft':
    case 'account-opencode-go-commit':
    case 'account-opencode-go-draft':
    case 'account-switcher-runtime':
    case 'account-switcher-toggle':
    case 'account-zcode-plan-draft':
      throw new AccountMountedActionError('invalid_argument')
  }
}
