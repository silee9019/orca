import { KeyRound } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { useBrowserWebAuthnDialogOwner } from './use-browser-webauthn-dialog-owner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { BrowserWebAuthnAccount } from '../../../shared/browser-webauthn-account'

function accountLabels(
  account: BrowserWebAuthnAccount,
  index: number
): { primary: string; secondary: string | null } {
  const primary =
    account.displayName?.trim() ||
    account.name?.trim() ||
    `${translate('auto.components.browser.webauthn.account.fallback', 'Passkey')} ${index + 1}`
  const secondary = account.name?.trim()
  return { primary, secondary: secondary && secondary !== primary ? secondary : null }
}

export function BrowserWebAuthnAccountDialog(): React.JSX.Element {
  const firstAccountRef = useRef<HTMLButtonElement | null>(null)
  const firstAccountBinding = useRef<{ requestId: string; accountId: string } | null>(null)
  const focusFirstAccount = useCallback((requestId?: string, accountId?: string): boolean => {
    const button = firstAccountRef.current
    const binding = firstAccountBinding.current
    if (
      !button ||
      button.disabled ||
      !binding ||
      (requestId !== undefined && requestId !== binding.requestId) ||
      (accountId !== undefined && accountId !== binding.accountId)
    ) {
      return false
    }
    button.focus()
    return document.activeElement === button
  }, [])
  const { requests, respondingRequestId, respond } =
    useBrowserWebAuthnDialogOwner(focusFirstAccount)
  const setContextualToursBlockingSurfaceVisible = useAppStore(
    (state) => state.setContextualToursBlockingSurfaceVisible
  )
  const activeRequest = requests[0] ?? null
  const lastRequestRef = useRef(activeRequest)
  const displayedRequest = activeRequest ?? lastRequestRef.current

  useEffect(() => {
    if (activeRequest) {
      lastRequestRef.current = activeRequest
    }
  }, [activeRequest, requests])

  useEffect(() => {
    setContextualToursBlockingSurfaceVisible(activeRequest !== null)
    return () => setContextualToursBlockingSurfaceVisible(false)
  }, [activeRequest, setContextualToursBlockingSurfaceVisible])

  useEffect(() => {
    if (!activeRequest) {
      return
    }
    const focusTimer = setTimeout(() => focusFirstAccount())
    return () => clearTimeout(focusTimer)
  }, [activeRequest, focusFirstAccount])

  return (
    <Dialog open={activeRequest !== null} onOpenChange={(open) => !open && respond(null)}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          focusFirstAccount()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.browser.webauthn.account.title', 'Choose a passkey')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.browser.webauthn.account.description',
              'Choose the account to use with this security key.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {displayedRequest?.accounts.map((account, index) => {
            const labels = accountLabels(account, index)
            return (
              <Button
                key={account.credentialId}
                ref={
                  index === 0
                    ? (button) => {
                        firstAccountRef.current = button
                        firstAccountBinding.current = button
                          ? {
                              requestId: displayedRequest.requestId,
                              accountId: account.credentialId
                            }
                          : null
                      }
                    : undefined
                }
                autoFocus={index === 0}
                type="button"
                variant="outline"
                className="h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                disabled={respondingRequestId === displayedRequest.requestId}
                onClick={() => respond(account.credentialId)}
              >
                <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{labels.primary}</span>
                  {labels.secondary ? (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {labels.secondary}
                    </span>
                  ) : null}
                </span>
              </Button>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {translate('auto.components.browser.webauthn.account.site', 'Site')}{' '}
          <span className="font-mono text-foreground">{displayedRequest?.relyingPartyId}</span>
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => respond(null)}>
            {translate('auto.components.browser.webauthn.account.cancel', 'Cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
