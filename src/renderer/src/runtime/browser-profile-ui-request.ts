import type {
  BrowserProfileUiCommand,
  BrowserProfileUiState
} from '../../../shared/rpc-contract/browser-profile-ui-params'
export type BrowserProfileUiEvent = {
  page: string
  command: BrowserProfileUiCommand
  expiresAt: number
  claim: () => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserProfileUiState) => void
}
export const BROWSER_PROFILE_UI_COMMAND_EVENT = 'orca:browser-profile-ui-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-profile-ui-command': CustomEvent<BrowserProfileUiEvent>
  }
}
export function requestBrowserProfileUi(
  page: string,
  command: BrowserProfileUiCommand,
  expiresAt: number
): Promise<BrowserProfileUiState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserProfileUiState): void => {
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
      () => finish(new Error('browser_profile_ui_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_PROFILE_UI_COMMAND_EVENT, {
        detail: {
          page,
          command,
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
      finish(new Error('browser_profile_ui_unavailable'))
    }
  })
}
