import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  REMOTE_BROWSER_FAILURE_EVENT,
  type RemoteBrowserFailureEvent
} from '@/runtime/browser-remote-failure-request'
import type {
  BrowserCertificateFailure,
  BrowserCertificateProceedResult
} from '../../../../../shared/browser-workspace-types'
import type { BrowserRemoteFailureState } from '../../../../../shared/rpc-contract/browser-remote-pane-params'
type RemoteFailureOwner = {
  page: string
  active: boolean
  visible: boolean
  environmentId: string
  remotePageId: string | null
  failureUrl: string
  capable: boolean
  failure: BrowserCertificateFailure | null
  externalAvailable: boolean
  copy: () => Promise<void>
  openExternal: () => Promise<void>
  proceed: (challenge: string) => Promise<BrowserCertificateProceedResult>
}
export function useRemoteBrowserFailureCommands(owner: RemoteFailureOwner): void {
  const current = useRef(owner)
  const pending = useRef<RemoteBrowserFailureEvent | null>(null)
  useLayoutEffect(() => {
    current.current = owner
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:remote-browser-failure-command']): void => {
      const request = event.detail
      const before = current.current
      if (request.page !== before.page || !request.claim()) {
        return
      }
      if (request.isSettled() || Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (!before.active || !before.visible || !before.environmentId || !before.remotePageId) {
        request.finish(new Error('remote_browser_failure_owner_inactive'))
        return
      }
      if (pending.current) {
        request.finish(new Error('remote_browser_failure_busy'))
        return
      }
      const command = request.command
      if (
        command.environmentId !== before.environmentId ||
        command.expectedRemotePageId !== before.remotePageId
      ) {
        request.finish(new Error('remote_browser_failure_owner_mismatch'))
        return
      }
      if (command.failureAction === 'certificate-proceed') {
        if (!before.capable) {
          request.finish(new Error('remote_browser_certificate_unsupported'))
          return
        }
        if (
          !before.failure?.canProceed ||
          before.failure.challengeId !== command.challengeId ||
          before.failure.browserPageId !== before.remotePageId
        ) {
          request.finish(new Error('remote_browser_certificate_challenge_mismatch'))
          return
        }
      }
      if (command.failureAction === 'open-external' && !before.externalAvailable) {
        request.finish(new Error('remote_browser_external_url_unavailable'))
        return
      }
      pending.current = request
      const perform = async (): Promise<BrowserRemoteFailureState> => {
        if (command.failureAction === 'copy-address') {
          await before.copy()
          return { clipboardRequested: true }
        }
        if (command.failureAction === 'open-external') {
          await before.openExternal()
          return { externalRequested: true }
        }
        if (command.failureAction === 'certificate-proceed') {
          return { certificate: await before.proceed(command.challengeId) }
        }
        throw new Error('remote_browser_failure_action_unavailable')
      }
      void perform()
        .then(
          (state) => {
            const after = current.current
            if (
              request.isSettled() ||
              Date.now() >= request.expiresAt ||
              !after.active ||
              !after.visible ||
              after.environmentId !== before.environmentId ||
              after.remotePageId !== before.remotePageId ||
              after.failureUrl !== before.failureUrl
            ) {
              request.finish(new Error('remote_browser_failure_owner_changed_effect_unknown'))
            } else {
              request.finish(undefined, state)
            }
          },
          (error: unknown) =>
            request.finish(
              error instanceof Error ? error : new Error('remote_browser_failure_effect_unknown')
            )
        )
        .finally(() => {
          if (pending.current === request) {
            pending.current = null
          }
        })
    }
    window.addEventListener(REMOTE_BROWSER_FAILURE_EVENT, receive)
    return () => window.removeEventListener(REMOTE_BROWSER_FAILURE_EVENT, receive)
  }, [owner.page])
  useEffect(
    () => () => {
      pending.current?.finish(new Error('remote_browser_failure_unmounted_effect_unknown'))
      pending.current = null
    },
    [owner.page]
  )
}
