import type {
  BrowserWebAuthnDialogTarget,
  BrowserWebAuthnDialogState
} from '../../../shared/rpc-contract/browser-webauthn-dialog-params'
export class BrowserWebAuthnDialogEvent extends Event {
  readonly offers: (() => Promise<BrowserWebAuthnDialogState>)[] = []
  constructor(
    readonly command: BrowserWebAuthnDialogTarget,
    readonly expiresAt: number
  ) {
    super('orca:browser-webauthn-dialog')
  }
}
export function requestBrowserWebAuthnDialog(
  command: BrowserWebAuthnDialogTarget,
  expiresAt: number
): Promise<BrowserWebAuthnDialogState> {
  const event = new BrowserWebAuthnDialogEvent(command, expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length
          ? 'webauthn_dialog_owner_ambiguous'
          : 'webauthn_dialog_owner_unavailable'
      )
    )
  }
  return event.offers[0]()
}
