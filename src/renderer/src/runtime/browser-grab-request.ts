import type { BrowserGrabViewerAction } from '../../../shared/rpc-contract/browser-viewer-params'
export type BrowserGrabState = {
  state: 'idle' | 'armed' | 'awaiting' | 'confirming' | 'error'
  hasSelection: boolean
  hasScreenshot: boolean
  contextMenu: boolean
  intent?: 'copy' | 'annotate'
}
export type BrowserGrabEvent = {
  page: string
  action: BrowserGrabViewerAction | 'intent-start' | 'await-ready'
  intent?: 'copy' | 'annotate'
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  claim: (active?: boolean) => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserGrabState) => void
}
export const BROWSER_GRAB_COMMAND_EVENT = 'orca:browser-grab-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-grab-command': CustomEvent<BrowserGrabEvent>
  }
}
export function requestBrowserGrab(
  page: string,
  action: BrowserGrabEvent['action'],
  expiresAt: number,
  intent?: 'copy' | 'annotate'
): Promise<BrowserGrabState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let inactive = false
    let claimed = false
    let settled = false
    const timer = window.setTimeout(
      () => finish(new Error('grab_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
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
    window.dispatchEvent(
      new CustomEvent(BROWSER_GRAB_COMMAND_EVENT, {
        detail: {
          page,
          action,
          intent,
          expiresAt,
          isSettled: () => settled,
          offer: (active: boolean, execute: () => void) => {
            if (active) {
              offers.push(execute)
            } else {
              inactive = true
            }
          },
          claim: (active = true) => {
            if (!active) {
              inactive = true
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
    if (action === 'toggle' || action === 'intent-start') {
      if (Date.now() >= expiresAt) {
        finish(new Error('request_expired'))
      } else if (offers.length > 1) {
        finish(new Error('browser_grab_owner_ambiguous'))
      } else if (offers.length === 1) {
        offers[0]?.()
      } else {
        finish(new Error(inactive ? 'browser_grab_viewer_inactive' : 'browser_grab_ui_unavailable'))
      }
      return
    }
    if (!claimed) {
      finish(new Error(inactive ? 'browser_grab_viewer_inactive' : 'browser_grab_ui_unavailable'))
    }
  })
}
