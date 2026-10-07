import {
  ClientHostedBrowserRowCommand,
  type ClientHostedBrowserRowState
} from '../../../shared/rpc-contract/client-hosted-browser-row-params'
export class ClientHostedBrowserRowEvent extends Event {
  readonly offers: (() => Promise<ClientHostedBrowserRowState>)[] = []
  constructor(
    readonly command: ClientHostedBrowserRowCommand,
    readonly expiresAt: number
  ) {
    super('orca:client-hosted-browser-row')
  }
}
export function requestClientHostedBrowserRow(
  command: ClientHostedBrowserRowCommand,
  expiresAt: number
): Promise<ClientHostedBrowserRowState> {
  const event = new ClientHostedBrowserRowEvent(
    ClientHostedBrowserRowCommand.parse(command),
    expiresAt
  )
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(event.offers.length ? 'client_row_owner_ambiguous' : 'client_row_owner_unavailable')
    )
  }
  return event.offers[0]()
}
