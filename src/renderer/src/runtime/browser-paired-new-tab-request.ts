import {
  BrowserPairedNewTabTarget,
  type BrowserPairedNewTabState
} from '../../../shared/rpc-contract/browser-paired-new-tab-params'
export class BrowserPairedNewTabEvent extends Event {
  readonly offers: (() => Promise<BrowserPairedNewTabState>)[] = []
  constructor(
    readonly command: BrowserPairedNewTabTarget,
    readonly expiresAt: number
  ) {
    super('orca:browser-paired-new-tab')
  }
}
export async function requestBrowserPairedNewTab(
  target: BrowserPairedNewTabTarget,
  expiresAt: number
): Promise<BrowserPairedNewTabState> {
  const event = new BrowserPairedNewTabEvent(BrowserPairedNewTabTarget.parse(target), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length
        ? 'browser_paired_new_tab_ambiguous'
        : 'browser_paired_new_tab_unavailable'
    )
  }
  return event.offers[0]()
}
