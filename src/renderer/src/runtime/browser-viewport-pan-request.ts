import {
  BrowserViewportPanDelta,
  type BrowserViewportPanReceipt
} from '../../../shared/rpc-contract/browser-viewport-pan-params'
export type BrowserViewportPanEvent = {
  page: string
  delta: BrowserViewportPanDelta
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserViewportPanReceipt) => void
}
export const BROWSER_VIEWPORT_PAN_COMMAND_EVENT = 'orca:browser-viewport-pan-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-viewport-pan-command': CustomEvent<BrowserViewportPanEvent>
  }
}
export async function requestBrowserViewportPan(
  page: string,
  delta: BrowserViewportPanDelta,
  expiresAt: number
): Promise<BrowserViewportPanReceipt> {
  BrowserViewportPanDelta.parse(delta)
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
    let settled = false
    const finish = (error?: Error, state?: BrowserViewportPanReceipt): void => {
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
      () => finish(new Error('viewport_pan_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_VIEWPORT_PAN_COMMAND_EVENT, {
        detail: {
          page,
          delta,
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
      finish(new Error('browser_viewport_pan_owner_ambiguous'))
    } else if (offers.length === 0) {
      finish(
        new Error(
          matchingOwners ? 'browser_viewport_pan_inactive' : 'browser_viewport_pan_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
