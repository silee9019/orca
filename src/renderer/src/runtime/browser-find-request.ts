import type { BrowserClientNavigationTarget } from '../../../shared/rpc-contract/browser-client-navigation-params'
export type BrowserFindAction = 'open' | 'query' | 'next' | 'previous' | 'close' | 'status'
export type BrowserFindState = {
  open: boolean
  query: string
  activeMatch: number
  totalMatches: number
}
export type BrowserFindEvent = {
  page: string
  action: BrowserFindAction
  query?: string
  expiresAt: number
  clientTarget?: BrowserClientNavigationTarget
  offer: (perform: () => void) => void
  isSettled: () => boolean
  claim: () => boolean
  finish: (error?: Error, state?: BrowserFindState) => void
}
export const BROWSER_FIND_COMMAND_EVENT = 'orca:browser-find-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-find-command': CustomEvent<BrowserFindEvent>
  }
}

export function requestBrowserFind(
  page: string,
  action: BrowserFindAction,
  expiresAt: number,
  query?: string,
  clientTarget?: BrowserClientNavigationTarget
): Promise<BrowserFindState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let claimed = false
    let settled = false
    const timer = window.setTimeout(
      () => finish(new Error('find_timeout_effect_unknown')),
      Math.max(0, Math.min(1500, expiresAt - Date.now()))
    )
    const finish = (error?: Error, state?: BrowserFindState): void => {
      if (settled) {
        return
      }
      if (!error && Date.now() >= expiresAt) {
        error = new Error('request_expired')
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (state) {
        resolve(state)
      }
    }
    window.dispatchEvent(
      new CustomEvent(BROWSER_FIND_COMMAND_EVENT, {
        detail: {
          page,
          clientTarget,
          offer: (perform: () => void) => offers.push(perform),
          action,
          query,
          expiresAt,
          isSettled: () => settled,
          claim: () => {
            if (clientTarget || claimed) {
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
        finish(new Error('browser_client_find_owner_unavailable_or_ambiguous'))
      } else {
        offers[0]?.()
      }
    } else if (!claimed) {
      finish(new Error('browser_find_ui_unavailable'))
    }
  })
}
