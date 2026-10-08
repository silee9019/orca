import type {
  BrowserReloadMenuAction,
  BrowserReloadMenuState
} from '../../../shared/rpc-contract/browser-reload-menu-params'
export type BrowserReloadMenuEvent = {
  page: string
  action: BrowserReloadMenuAction
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserReloadMenuState) => void
}
export const BROWSER_RELOAD_MENU_COMMAND_EVENT = 'orca:browser-reload-menu-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-reload-menu-command': CustomEvent<BrowserReloadMenuEvent>
  }
}
export function requestBrowserReloadMenu(
  page: string,
  action: BrowserReloadMenuAction,
  expiresAt: number
): Promise<BrowserReloadMenuState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
    let settled = false
    const finish = (error?: Error, state?: BrowserReloadMenuState): void => {
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
      () => finish(new Error('reload_menu_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_RELOAD_MENU_COMMAND_EVENT, {
        detail: {
          page,
          action,
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
      finish(new Error('browser_reload_menu_owner_ambiguous'))
    } else if (offers.length === 0) {
      finish(
        new Error(
          matchingOwners ? 'browser_reload_menu_inactive' : 'browser_reload_menu_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
