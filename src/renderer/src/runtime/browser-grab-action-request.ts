import type {
  BrowserGrabActionKey,
  BrowserGrabActionReceipt
} from '../../../shared/rpc-contract/browser-grab-action-params'
export type BrowserGrabActionEvent = {
  page: string
  key: BrowserGrabActionKey
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, receipt?: BrowserGrabActionReceipt) => void
}
export const BROWSER_GRAB_ACTION_EVENT = 'orca:browser-grab-action-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-grab-action-command': CustomEvent<BrowserGrabActionEvent>
  }
}
export function requestBrowserGrabAction(
  page: string,
  key: BrowserGrabActionKey,
  expiresAt: number
): Promise<BrowserGrabActionReceipt> {
  return new Promise((resolve, reject) => {
    let settled = false
    let owners = 0
    const offers: (() => void)[] = []
    const finish = (error?: Error, receipt?: BrowserGrabActionReceipt): void => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (receipt) {
        resolve(receipt)
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('grab_action_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_GRAB_ACTION_EVENT, {
        detail: {
          page,
          key,
          expiresAt,
          isSettled: () => settled,
          finish,
          offer: (active: boolean, execute: () => void) => {
            owners += 1
            if (active) {
              offers.push(execute)
            }
          }
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length > 1) {
      finish(new Error('browser_grab_action_owner_ambiguous'))
    } else if (!offers.length) {
      finish(
        new Error(
          owners ? 'browser_grab_action_viewer_inactive' : 'browser_grab_action_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
