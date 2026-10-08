import type {
  BrowserSshRouteTarget,
  BrowserSshRouteReceipt
} from '../../../shared/rpc-contract/browser-ssh-route-params'
export class BrowserSshRouteEvent extends Event {
  readonly offers: (() => Promise<BrowserSshRouteReceipt>)[] = []
  constructor(
    readonly command: BrowserSshRouteTarget,
    readonly expiresAt: number
  ) {
    super('orca:browser-ssh-route')
  }
}
export async function requestBrowserSshRoute(
  target: BrowserSshRouteTarget,
  expiresAt: number
): Promise<BrowserSshRouteReceipt> {
  const event = new BrowserSshRouteEvent(target, expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length
        ? 'browser_ssh_route_owner_ambiguous'
        : 'browser_ssh_route_owner_unavailable'
    )
  }
  return event.offers[0]()
}
