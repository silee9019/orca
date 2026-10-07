export type BrowserMarkupState = {
  state: 'idle' | 'capturing' | 'drawing' | 'composing'
  hasImage: boolean
}
export type BrowserMarkupEvent = {
  page: string
  action: 'start' | 'cancel' | 'status'
  expiresAt: number
  claim: () => boolean
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
  expiresAt: number
): Promise<BrowserMarkupState> {
  return new Promise((resolve, reject) => {
    let claimed = false
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
      finish(new Error('browser_markup_ui_unavailable'))
    }
  })
}
