import {
  BrowserBannerCommand,
  type BrowserBannerState
} from '../../../shared/rpc-contract/browser-banner-params'
export class BrowserBannerEvent extends Event {
  readonly offers: (() => Promise<BrowserBannerState>)[] = []
  constructor(
    readonly command: BrowserBannerCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-banner')
  }
}
export function requestBrowserBanner(
  command: BrowserBannerCommand,
  expiresAt: number
): Promise<BrowserBannerState> {
  const event = new BrowserBannerEvent(BrowserBannerCommand.parse(command), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length ? 'browser_banner_owner_ambiguous' : 'browser_banner_owner_unavailable'
      )
    )
  }
  return event.offers[0]()
}
