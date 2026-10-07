import type {
  BrowserAnnotationTrayAction,
  BrowserAnnotationTrayState
} from '../../../shared/rpc-contract/browser-annotation-tray-params'
export type BrowserAnnotationTrayEvent = {
  page: string
  action: BrowserAnnotationTrayAction
  expiresAt: number
  claim: () => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserAnnotationTrayState) => void
}
export const BROWSER_ANNOTATION_TRAY_COMMAND_EVENT = 'orca:browser-annotation-tray-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-annotation-tray-command': CustomEvent<BrowserAnnotationTrayEvent>
  }
}
export function requestBrowserAnnotationTray(
  page: string,
  action: BrowserAnnotationTrayEvent['action'],
  expiresAt: number
): Promise<BrowserAnnotationTrayState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserAnnotationTrayState): void => {
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
      () => finish(new Error('annotation_tray_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_ANNOTATION_TRAY_COMMAND_EVENT, {
        detail: {
          page,
          action,
          expiresAt,
          isSettled: () => settled,
          claim: () => {
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
      finish(new Error('browser_annotation_tray_ui_unavailable'))
    }
  })
}
