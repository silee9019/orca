import { AccountMountedActionError } from '../../../shared/account-mounted-viewer-command'
import { useLayoutEffect } from 'react'
import type { AccountsPaneSectionModel } from '../components/settings/accounts-pane-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { BitbucketAuthMode } from '../../../shared/bitbucket-credentials'
import {
  registerMiniMaxDraftControls,
  registerOpenCodeGoDraftControls,
  registerOpenCodeGoCommitControls,
  registerZcodePlanDraftControls,
  registerBitbucketDraftControls,
  registerAgentEnvDraftControls,
  type MiniMaxDraftControls,
  type SecretDraftControls
} from './account-mounted-draft-controls'
import { registerBitbucketDialogControls } from './account-mounted-dialog-controls'

export function useMountedMiniMaxDraftControls(controls: MiniMaxDraftControls) {
  useLayoutEffect(() => registerMiniMaxDraftControls(controls), [controls])
}
export function useMountedOpenCodeGoDraftControls(controls: SecretDraftControls) {
  useLayoutEffect(() => registerOpenCodeGoDraftControls(controls), [controls])
}
export function useMountedZcodePlanDraftControls(controls: SecretDraftControls) {
  useLayoutEffect(() => registerZcodePlanDraftControls(controls), [controls])
}
export function useMountedAgentEnvDraftControls(
  agent: TuiAgent | undefined,
  controls: SecretDraftControls
) {
  useLayoutEffect(
    () => (agent ? registerAgentEnvDraftControls(agent, controls) : undefined),
    [agent, controls]
  )
}

type BitbucketMountedControls = {
  open: boolean
  locked: boolean
  connecting: boolean
  setAuthMode: (value: BitbucketAuthMode) => void
  setEmail: (value: string) => void
  setApiToken: (value: string) => void
  setAccessToken: (value: string) => void
  setBaseUrl: (value: string) => void
  clearErrorOnEdit: () => void
  handleOpenChange: (open: boolean) => void
  guardOutsideDismiss: (event: { preventDefault: () => void }) => void
}

export function useMountedBitbucketControls(controls: BitbucketMountedControls) {
  useLayoutEffect(() => {
    const assertEditable = () => {
      if (!controls.open) {
        throw new AccountMountedActionError('unavailable')
      }
      if (controls.locked || controls.connecting) {
        throw new AccountMountedActionError('busy')
      }
    }
    const edit = (setter: (value: string) => void) => (value: string) => {
      assertEditable()
      setter(value)
      controls.clearErrorOnEdit()
    }
    const unregisterDraft = registerBitbucketDraftControls({
      authMode: (value) => {
        assertEditable()
        controls.setAuthMode(value)
        controls.clearErrorOnEdit()
      },
      email: edit(controls.setEmail),
      apiToken: edit(controls.setApiToken),
      accessToken: edit(controls.setAccessToken),
      baseUrl: edit(controls.setBaseUrl)
    })
    const unregisterDialog = registerBitbucketDialogControls({
      setOpen: (open) => {
        if (controls.connecting) {
          throw new AccountMountedActionError('busy')
        }
        controls.handleOpenChange(open)
      },
      outsideDismiss: () => {
        let prevented = false
        controls.guardOutsideDismiss({
          preventDefault: () => {
            prevented = true
          }
        })
        if (!prevented) {
          controls.handleOpenChange(false)
        }
        return { prevented }
      }
    })
    return () => {
      unregisterDraft()
      unregisterDialog()
    }
  }, [controls])
}

export function useMountedMiniMaxDraftModel(model: AccountsPaneSectionModel) {
  useMountedMiniMaxDraftControls({
    cookie: (value) => {
      if (model.miniMaxCredentialBusy) {
        throw new AccountMountedActionError('busy')
      }
      model.setMiniMaxCookieDraft(value)
    },
    apiKey: (value) => {
      if (model.miniMaxCredentialBusy) {
        throw new AccountMountedActionError('busy')
      }
      model.setMiniMaxApiKeyDraft(value)
    }
  })
}

export function useMountedOpenCodeGoCommitControls(
  run: (operation: 'save' | 'clear') => Promise<void>
) {
  useLayoutEffect(() => registerOpenCodeGoCommitControls({ run }), [run])
}
