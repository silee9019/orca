import type {
  BrowserNewTabTarget,
  BrowserNewTabState
} from '../../../shared/rpc-contract/browser-new-tab-params'
export type BrowserNewTabEvent = {
  target: BrowserNewTabTarget
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserNewTabState) => void
}
export const BROWSER_NEW_TAB_COMMAND_EVENT = 'orca:browser-new-tab-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-new-tab-command': CustomEvent<BrowserNewTabEvent>
  }
}
export function requestBrowserNewTab(
  target: BrowserNewTabTarget,
  expiresAt: number
): Promise<BrowserNewTabState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
    let settled = false
    const finish = (error?: Error, state?: BrowserNewTabState): void => {
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
      () => finish(new Error('new_tab_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_NEW_TAB_COMMAND_EVENT, {
        detail: {
          target,
          expiresAt,
          isSettled: () => settled,
          offer: (active: boolean, execute: () => void) => {
            matchingOwners += 1
            if (active) {
              offers.push(execute)
            }
          },
          finish
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length > 1) {
      finish(new Error('browser_new_tab_owner_ambiguous'))
    } else if (offers.length === 0) {
      finish(
        new Error(matchingOwners ? 'browser_new_tab_inactive' : 'browser_new_tab_ui_unavailable')
      )
    } else {
      offers[0]?.()
    }
  })
}
