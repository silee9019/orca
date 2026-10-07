import type {
  BrowserTabUiAction,
  BrowserTabUiPoint,
  BrowserTabUiState,
  BrowserTabUiTarget
} from '../../../shared/rpc-contract/browser-tab-ui-params'
export type BrowserTabUiEvent = {
  target: BrowserTabUiTarget
  action: BrowserTabUiAction
  point?: BrowserTabUiPoint
  isSettled: () => boolean
  expiresAt: number
  claim: () => boolean
  finish: (error?: Error, state?: BrowserTabUiState) => void
}
export const BROWSER_TAB_UI_COMMAND_EVENT = 'orca:browser-tab-ui-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-tab-ui-command': CustomEvent<BrowserTabUiEvent>
  }
}
export function requestBrowserTabUi(
  target: BrowserTabUiTarget,
  action: BrowserTabUiAction,
  expiresAt: number,
  point?: BrowserTabUiPoint
): Promise<BrowserTabUiState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserTabUiState): void => {
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
      () => finish(new Error('browser_tab_ui_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_TAB_UI_COMMAND_EVENT, {
        detail: {
          target,
          action,
          point,
          isSettled: () => settled,
          expiresAt,
          finish,
          claim: () => {
            if (claimed) {
              return false
            }
            claimed = true
            return true
          }
        }
      })
    )
    if (!claimed) {
      finish(new Error('browser_tab_ui_unavailable'))
    }
  })
}
