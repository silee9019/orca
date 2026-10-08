import {
  BrowserWebAuthnFocusTarget,
  type BrowserWebAuthnFocusState
} from '../../../shared/rpc-contract/browser-webauthn-focus-params'
export class BrowserWebAuthnFocusEvent extends Event {
  readonly offers: (() => Promise<BrowserWebAuthnFocusState>)[] = []
  constructor(
    readonly command: BrowserWebAuthnFocusTarget,
    readonly expiresAt: number
  ) {
    super('orca:browser-webauthn-focus')
  }
}
export function requestBrowserWebAuthnFocus(
  command: BrowserWebAuthnFocusTarget,
  expiresAt: number
): Promise<BrowserWebAuthnFocusState> {
  const event = new BrowserWebAuthnFocusEvent(BrowserWebAuthnFocusTarget.parse(command), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length ? 'webauthn_focus_owner_ambiguous' : 'webauthn_focus_owner_unavailable'
      )
    )
  }
  return event.offers[0]()
}
