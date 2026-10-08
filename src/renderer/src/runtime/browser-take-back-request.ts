import {
  BrowserTakeBackCommand,
  type BrowserTakeBackState
} from '../../../shared/rpc-contract/browser-take-back-params'
export class BrowserTakeBackEvent extends Event {
  readonly offers: (() => Promise<BrowserTakeBackState>)[] = []
  constructor(
    readonly command: BrowserTakeBackCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-take-back')
  }
}
export function requestBrowserTakeBack(
  command: BrowserTakeBackCommand,
  expiresAt: number
): Promise<BrowserTakeBackState> {
  const event = new BrowserTakeBackEvent(BrowserTakeBackCommand.parse(command), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length
          ? 'browser_take_back_owner_ambiguous'
          : 'browser_take_back_owner_unavailable'
      )
    )
  }
  return event.offers[0]()
}
