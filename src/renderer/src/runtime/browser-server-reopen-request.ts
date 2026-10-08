import {
  BrowserServerReopenCommand,
  type BrowserServerReopenState
} from '../../../shared/rpc-contract/browser-server-reopen-params'
export class BrowserServerReopenEvent extends Event {
  readonly offers: (() => Promise<BrowserServerReopenState>)[] = []
  constructor(
    readonly command: BrowserServerReopenCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-server-reopen')
  }
}
export function requestBrowserServerReopen(
  command: BrowserServerReopenCommand,
  expiresAt: number
): Promise<BrowserServerReopenState> {
  const event = new BrowserServerReopenEvent(BrowserServerReopenCommand.parse(command), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length
          ? 'browser_server_reopen_ambiguous'
          : 'browser_server_reopen_unavailable'
      )
    )
  }
  return event.offers[0]()
}
