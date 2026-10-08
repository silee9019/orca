import type {
  BrowserMarkupHintAction,
  BrowserMarkupHintState
} from '../../../shared/rpc-contract/browser-markup-hint-params'
export type BrowserMarkupHintEvent = {
  page: string
  action: BrowserMarkupHintAction
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserMarkupHintState) => void
}
export const BROWSER_MARKUP_HINT_COMMAND_EVENT = 'orca:browser-markup-hint-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-markup-hint-command': CustomEvent<BrowserMarkupHintEvent>
  }
}
export function requestBrowserMarkupHint(
  page: string,
  action: BrowserMarkupHintAction,
  expiresAt: number
): Promise<BrowserMarkupHintState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
    let settled = false
    const finish = (error?: Error, state?: BrowserMarkupHintState): void => {
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
      () => finish(new Error('markup_hint_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_MARKUP_HINT_COMMAND_EVENT, {
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
      finish(new Error('browser_markup_hint_owner_ambiguous'))
    } else if (offers.length === 0) {
      finish(
        new Error(
          matchingOwners ? 'browser_markup_hint_inactive' : 'browser_markup_hint_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
