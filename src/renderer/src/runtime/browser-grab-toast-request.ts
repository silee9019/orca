import {
  BrowserGrabToastCommand,
  type BrowserGrabToastState
} from '../../../shared/rpc-contract/browser-grab-toast-params'
export class BrowserGrabToastEvent extends Event {
  readonly offers: (() => Promise<BrowserGrabToastState>)[] = []
  constructor(
    readonly command: BrowserGrabToastCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-grab-toast')
  }
}
export function requestBrowserGrabToast(
  command: BrowserGrabToastCommand,
  expiresAt: number
): Promise<BrowserGrabToastState> {
  const event = new BrowserGrabToastEvent(BrowserGrabToastCommand.parse(command), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length ? 'browser_grab_toast_ambiguous' : 'browser_grab_toast_unavailable'
      )
    )
  }
  return event.offers[0]()
}
