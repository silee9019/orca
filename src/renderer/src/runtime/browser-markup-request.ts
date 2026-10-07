import type { BrowserClientMarkupTarget } from '../../../shared/rpc-contract/browser-client-markup-params'
export type BrowserMarkupState = {
  state: 'idle' | 'capturing' | 'drawing' | 'composing'
  clientTarget?: BrowserClientMarkupTarget
  hasImage: boolean
}
export type BrowserMarkupEvent = {
  page: string
  clientTarget?: BrowserClientMarkupTarget
  settledState?: 'idle'
  action: 'start' | 'cancel' | 'status'
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserMarkupState) => void
}
export const BROWSER_MARKUP_COMMAND_EVENT = 'orca:browser-markup-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-markup-command': CustomEvent<BrowserMarkupEvent>
  }
}
export function requestBrowserMarkup(
  page: string,
  action: BrowserMarkupEvent['action'],
  expiresAt: number,
  clientTarget?: BrowserClientMarkupTarget,
  settledState?: 'idle'
): Promise<BrowserMarkupState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
    let settled = false
    const finish = (error?: Error, state?: BrowserMarkupState): void => {
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
      () => finish(new Error('markup_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_MARKUP_COMMAND_EVENT, {
        detail: {
          page,
          clientTarget,
          settledState,
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
      finish(new Error('browser_markup_owner_ambiguous'))
    } else if (offers.length === 0) {
      finish(
        new Error(
          matchingOwners ? 'browser_markup_viewer_inactive' : 'browser_markup_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
