import { matchesBrowserClientPageCommandTarget } from '@/runtime/browser-client-page-command-target'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { BrowserWebAuthnDialogEvent } from '@/runtime/browser-webauthn-dialog-request'
import type { BrowserWebAuthnAccountRequest } from '../../../shared/browser-webauthn-account'
import type { BrowserWebAuthnDialogState } from '../../../shared/rpc-contract/browser-webauthn-dialog-params'

export function useBrowserWebAuthnDialogOwner() {
  const [requests, setRequests] = useState<BrowserWebAuthnAccountRequest[]>([])
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null)
  const queue = useRef(requests)
  const pending = useRef<string | null>(null)
  const mounted = useRef(false)
  const generation = useRef(0)
  const removal = useCallback((requestId: string) => {
    queue.current = queue.current.filter((request) => request.requestId !== requestId)
    setRequests(queue.current)
    setRespondingRequestId((current) => (current === requestId ? null : current))
  }, [])
  const submit = useCallback(
    async (credentialId: string | null): Promise<void> => {
      const request = queue.current[0]
      if (!mounted.current || !request) {
        throw new Error('webauthn_dialog_owner_unavailable')
      }
      if (pending.current) {
        throw new Error('webauthn_dialog_busy')
      }
      if (
        credentialId !== null &&
        !request.accounts.some((account) => account.credentialId === credentialId)
      ) {
        throw new Error('webauthn_dialog_credential_mismatch')
      }
      const epoch = generation.current
      pending.current = request.requestId
      setRespondingRequestId(request.requestId)
      try {
        const accepted = await window.api.browser.respondWebAuthnAccount({
          requestId: request.requestId,
          credentialId
        })
        if (!mounted.current || generation.current !== epoch) {
          throw new Error('webauthn_dialog_unmounted_effect_unknown')
        }
        if (!accepted) {
          throw new Error('webauthn_dialog_response_refused')
        }
        if (
          queue.current.some((item) => item.requestId === request.requestId && item !== request)
        ) {
          throw new Error('webauthn_dialog_request_replaced_effect_unknown')
        }
        removal(request.requestId)
      } finally {
        pending.current = null
        if (mounted.current) {
          setRespondingRequestId(null)
        }
      }
    },
    [removal]
  )
  const respond = useCallback(
    (credentialId: string | null): void => {
      void submit(credentialId).catch(() => {})
    },
    [submit]
  )
  useEffect(() => {
    mounted.current = true
    generation.current += 1
    const epoch = generation.current
    let rejectPending: ((error: Error) => void) | undefined
    const stopRequests = window.api.browser.onWebAuthnAccountRequest((request) => {
      queue.current = [...queue.current, request]
      setRequests(queue.current)
    })
    const stopClosures = window.api.browser.onWebAuthnAccountRequestClosed(({ requestId }) =>
      removal(requestId)
    )
    const receive = (event: Event) => {
      if (
        !(event instanceof BrowserWebAuthnDialogEvent) ||
        queue.current[0]?.requestId !== event.command.requestId
      ) {
        return
      }
      const request = queue.current[0]
      event.offers.push(async () => {
        const command = event.command
        const matches = () => {
          const state = useAppStore.getState()
          const page = findPage(state.browserPagesByWorkspace, command.page)
          return (
            mounted.current &&
            generation.current === epoch &&
            page?.worktreeId === command.worktreeId &&
            (page.browserRuntimeEnvironmentId ?? null) === command.environmentId &&
            (command.environmentId === null
              ? command.clientTarget === undefined &&
                !state.remoteBrowserPageHandlesByPageId[command.page]
              : matchesBrowserClientPageCommandTarget(
                  state.remoteBrowserPageHandlesByPageId[command.page],
                  command.environmentId,
                  command.clientTarget
                )) &&
            state.activeModal === 'none'
          )
        }
        if (
          !matches() ||
          queue.current[0] !== request ||
          request.requestId !== command.requestId ||
          request.browserPageId !== command.page ||
          request.relyingPartyId !== command.relyingPartyId ||
          Date.now() >= event.expiresAt
        ) {
          throw new Error('webauthn_dialog_target_changed')
        }
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          return await new Promise<BrowserWebAuthnDialogState>((resolve, reject) => {
            if (pending.current) {
              reject(new Error('webauthn_dialog_busy'))
              return
            }
            rejectPending = reject
            timer = setTimeout(
              () => reject(new Error('webauthn_dialog_expired_effect_unknown')),
              Math.max(0, event.expiresAt - Date.now())
            )
            void submit(command.credentialId)
              .then(() => {
                if (
                  !matches() ||
                  Date.now() >= event.expiresAt ||
                  queue.current.some((item) => item.requestId === command.requestId)
                ) {
                  reject(new Error('webauthn_dialog_owner_changed_effect_unknown'))
                } else {
                  resolve({
                    requestId: command.requestId,
                    page: command.page,
                    worktreeId: command.worktreeId,
                    environmentId: command.environmentId,
                    relyingPartyId: command.relyingPartyId,
                    ...(command.clientTarget ? { clientTarget: command.clientTarget } : {}),
                    action: command.credentialId === null ? 'cancel' : 'select',
                    accepted: true,
                    removed: true
                  })
                }
              }, reject)
              .finally(() => {
                if (rejectPending === reject) {
                  rejectPending = undefined
                }
              })
          })
        } finally {
          clearTimeout(timer)
        }
      })
    }
    window.addEventListener('orca:browser-webauthn-dialog', receive)
    return () => {
      mounted.current = false
      stopRequests()
      stopClosures()
      window.removeEventListener('orca:browser-webauthn-dialog', receive)
      rejectPending?.(new Error('webauthn_dialog_unmounted_effect_unknown'))
      for (const request of queue.current) {
        if (request.requestId !== pending.current) {
          void window.api.browser
            .respondWebAuthnAccount({ requestId: request.requestId, credentialId: null })
            .catch(() => {})
        }
      }
    }
  }, [removal, submit])
  return { requests, respondingRequestId, respond }
}
