import { useEffect, type RefObject } from 'react'
import { BrowserWebAuthnFocusEvent } from '@/runtime/browser-webauthn-focus-request'
import { matchesBrowserWebAuthnPageTarget } from './browser-webauthn-page-target'
import type { BrowserWebAuthnAccountRequest } from '../../../shared/browser-webauthn-account'
type Owner = {
  queue: RefObject<BrowserWebAuthnAccountRequest[]>
  pending: RefObject<string | null>
  mounted: RefObject<boolean>
  generation: RefObject<number>
  focus?: (requestId?: string, accountId?: string) => boolean
}
export function useBrowserWebAuthnFocusOwner({
  queue,
  pending,
  mounted,
  generation,
  focus
}: Owner): void {
  useEffect(() => {
    let attached = true
    const receive = (raw: Event) => {
      if (!(raw instanceof BrowserWebAuthnFocusEvent)) {
        return
      }
      const event = raw
      const before = queue.current[0]
      if (!before || before.requestId !== event.command.requestId) {
        return
      }
      const epoch = generation.current
      event.offers.push(async () => {
        const command = event.command
        const check = () => {
          if (
            !attached ||
            !mounted.current ||
            generation.current !== epoch ||
            queue.current[0] !== before ||
            before.browserPageId !== command.page ||
            before.relyingPartyId !== command.relyingPartyId ||
            !matchesBrowserWebAuthnPageTarget(command) ||
            Date.now() >= event.expiresAt
          ) {
            throw new Error('webauthn_focus_target_changed')
          }
          if (pending.current) {
            throw new Error('webauthn_focus_busy')
          }
          if (before.accounts[0]?.credentialId !== command.accountId) {
            throw new Error('webauthn_focus_first_account_mismatch')
          }
        }
        check()
        if (!focus?.(command.requestId, command.accountId)) {
          throw new Error('webauthn_focus_effect_unknown')
        }
        check()
        const { accountId: _, ...identity } = command
        return { ...identity, focused: true as const, accountIndex: 0 as const }
      })
    }
    window.addEventListener('orca:browser-webauthn-focus', receive)
    return () => {
      attached = false
      window.removeEventListener('orca:browser-webauthn-focus', receive)
    }
  }, [queue, pending, mounted, generation, focus])
}
