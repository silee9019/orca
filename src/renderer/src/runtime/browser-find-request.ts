export type BrowserFindAction = 'open' | 'query' | 'next' | 'previous' | 'close' | 'status'
export type BrowserFindState = {
  open: boolean
  query: string
  activeMatch: number
  totalMatches: number
}
export type BrowserFindEvent = {
  page: string
  action: BrowserFindAction
  query?: string
  expiresAt: number
  isSettled: () => boolean
  claim: () => boolean
  finish: (error?: Error, state?: BrowserFindState) => void
}
export const BROWSER_FIND_COMMAND_EVENT = 'orca:browser-find-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-find-command': CustomEvent<BrowserFindEvent>
  }
}

export function requestBrowserFind(
  page: string,
  action: BrowserFindAction,
  expiresAt: number,
  query?: string
): Promise<BrowserFindState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const timer = window.setTimeout(
      () => finish(new Error('find_timeout_effect_unknown')),
      Math.max(0, Math.min(1500, expiresAt - Date.now()))
    )
    const finish = (error?: Error, state?: BrowserFindState): void => {
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
      new CustomEvent(BROWSER_FIND_COMMAND_EVENT, {
        detail: {
          page,
          action,
          query,
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
      finish(new Error('browser_find_ui_unavailable'))
    }
  })
}
