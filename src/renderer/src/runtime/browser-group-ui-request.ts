import type {
  BrowserGroupUiAction,
  BrowserGroupUiState,
  BrowserGroupUiTarget
} from '../../../shared/rpc-contract/browser-group-ui-params'
export type BrowserGroupUiEvent = {
  target: BrowserGroupUiTarget
  action: BrowserGroupUiAction
  isSettled: () => boolean
  expiresAt: number
  claim: () => boolean
  finish: (error?: Error, state?: BrowserGroupUiState) => void
}
export const BROWSER_GROUP_UI_COMMAND_EVENT = 'orca:browser-group-ui-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-group-ui-command': CustomEvent<BrowserGroupUiEvent>
  }
}
export function requestBrowserGroupUi(
  target: BrowserGroupUiTarget,
  action: BrowserGroupUiAction,
  expiresAt: number
): Promise<BrowserGroupUiState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserGroupUiState): void => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (state) {
        resolve(state)
      } else {
        reject(new Error('browser_group_ui_effect_unknown'))
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('browser_group_ui_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_GROUP_UI_COMMAND_EVENT, {
        detail: {
          target,
          action,
          expiresAt,
          isSettled: () => settled,
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
      finish(new Error('browser_group_ui_unavailable'))
    }
  })
}
