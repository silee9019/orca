import type {
  BrowserFailureTarget,
  BrowserFailureState
} from '../../../shared/rpc-contract/browser-failure-params'
export class BrowserFailureEvent extends Event {
  readonly offers: (() => Promise<BrowserFailureState>)[] = []
  constructor(
    readonly page: string,
    readonly command: BrowserFailureTarget,
    readonly expiresAt: number
  ) {
    super('orca:browser-failure')
  }
}
export function requestBrowserFailure(
  page: string,
  command: BrowserFailureTarget,
  expiresAt: number
): Promise<BrowserFailureState> {
  const event = new BrowserFailureEvent(page, command, expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length
          ? 'browser_failure_owner_ambiguous'
          : 'browser_failure_owner_unavailable'
      )
    )
  }
  return event.offers[0]()
}
