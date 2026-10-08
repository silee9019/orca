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
    if (!claimed) {
      finish(new Error(inactive ? 'browser_grab_viewer_inactive' : 'browser_grab_ui_unavailable'))
    }
  })
}
