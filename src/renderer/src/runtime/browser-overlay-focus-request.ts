import {
  BrowserOverlayFocusCommand,
  type BrowserOverlayFocusState
} from '../../../shared/rpc-contract/browser-overlay-focus-params'
export class BrowserOverlayFocusEvent extends Event {
  readonly offers: (() => BrowserOverlayFocusState)[] = []
  constructor(
    readonly command: BrowserOverlayFocusCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-overlay-focus')
  }
}
export function requestBrowserOverlayFocus(
  command: BrowserOverlayFocusCommand,
  expiresAt: number
): BrowserOverlayFocusState {
  const event = new BrowserOverlayFocusEvent(BrowserOverlayFocusCommand.parse(command), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length
        ? 'browser_overlay_focus_owner_ambiguous'
        : 'browser_overlay_focus_owner_unavailable'
    )
  }
  return event.offers[0]()
}
