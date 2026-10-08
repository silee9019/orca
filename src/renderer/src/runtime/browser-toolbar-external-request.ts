import {
  BrowserToolbarExternalCommand,
  type BrowserToolbarExternalState
} from '../../../shared/rpc-contract/browser-toolbar-external-params'
export class BrowserToolbarExternalEvent extends Event {
  readonly offers: (() => Promise<BrowserToolbarExternalState>)[] = []
  constructor(
    readonly command: BrowserToolbarExternalCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-toolbar-external')
  }
}
export async function requestBrowserToolbarExternal(
  command: BrowserToolbarExternalCommand,
  expiresAt: number
): Promise<BrowserToolbarExternalState> {
  const event = new BrowserToolbarExternalEvent(
    BrowserToolbarExternalCommand.parse(command),
    expiresAt
  )
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length
        ? 'browser_toolbar_external_owner_ambiguous'
        : 'browser_toolbar_external_owner_unavailable'
    )
  }
  return event.offers[0]()
}
