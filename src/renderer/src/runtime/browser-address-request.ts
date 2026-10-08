import type { BrowserClientAddressTarget } from '../../../shared/rpc-contract/browser-client-address-params'
import type {
  BrowserAddressCommand,
  BrowserAddressState
} from '../../../shared/rpc-contract/browser-address-params'
export type BrowserAddressEvent = {
  page: string
  command: BrowserAddressCommand
  expiresAt: number
  clientTarget?: BrowserClientAddressTarget
  offer: (perform: () => void) => void
  claim: () => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserAddressState) => void
}
export const BROWSER_ADDRESS_COMMAND_EVENT = 'orca:browser-address-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-address-command': CustomEvent<BrowserAddressEvent>
  }
}
export function requestBrowserAddress(
  page: string,
  command: BrowserAddressCommand,
  expiresAt: number,
  clientTarget?: BrowserClientAddressTarget
): Promise<BrowserAddressState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserAddressState): void => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (state) {
        resolve(state)
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('address_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_ADDRESS_COMMAND_EVENT, {
        detail: {
          page,
          clientTarget,
          command,
          expiresAt,
          isSettled: () => settled,
          offer: (perform: () => void) => offers.push(perform),
          claim: () => {
            if (clientTarget) {
              return false
            }
            if (claimed) {
              return false
            }
            claimed = true
            return true
          },
          finish
        }
      })
    )
    if (clientTarget) {
      if (Date.now() >= expiresAt) {
        finish(new Error('request_expired'))
      } else if (offers.length !== 1) {
        finish(new Error('browser_client_address_owner_unavailable_or_ambiguous'))
      } else {
        offers[0]?.()
      }
    } else if (!claimed) {
      finish(new Error('browser_address_ui_unavailable'))
    }
  })
}
