import type { BrowserGrabState } from './browser-grab-request'
export type BrowserCopyShortcutEvent = {
  page: string
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserGrabState) => void
}
export const BROWSER_COPY_SHORTCUT_COMMAND_EVENT = 'orca:browser-copy-shortcut-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-copy-shortcut-command': CustomEvent<BrowserCopyShortcutEvent>
  }
}
export function requestBrowserCopyShortcut(
  page: string,
  expiresAt: number
): Promise<BrowserGrabState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
    let settled = false
    const finish = (error?: Error, state?: BrowserGrabState): void => {
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
      () => finish(new Error('copy_shortcut_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_COPY_SHORTCUT_COMMAND_EVENT, {
        detail: {
          page,
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
      finish(new Error('browser_copy_shortcut_owner_ambiguous'))
    } else if (offers.length === 0) {
      finish(
        new Error(
          matchingOwners ? 'browser_copy_shortcut_inactive' : 'browser_copy_shortcut_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
