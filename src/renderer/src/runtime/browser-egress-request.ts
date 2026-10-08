import {
  BrowserEgressCommand,
  type BrowserEgressState
} from '../../../shared/rpc-contract/browser-egress-params'
export class BrowserEgressEvent extends Event {
  readonly offers: (() => Promise<BrowserEgressState>)[] = []
  constructor(
    readonly command: BrowserEgressCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-egress')
  }
}
export function requestBrowserEgress(
  command: BrowserEgressCommand,
  expiresAt: number
): Promise<BrowserEgressState> {
  const event = new BrowserEgressEvent(BrowserEgressCommand.parse(command), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length ? 'browser_egress_owner_ambiguous' : 'browser_egress_owner_unavailable'
      )
    )
  }
  return event.offers[0]()
}
