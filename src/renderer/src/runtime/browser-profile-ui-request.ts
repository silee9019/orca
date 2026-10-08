import type {
  BrowserProfileUiCommand,
  BrowserProfileUiState
} from '../../../shared/rpc-contract/browser-profile-ui-params'
export type BrowserProfileUiEvent = {
  page: string
  command: BrowserProfileUiCommand
  expiresAt: number
  offer: (perform: () => void) => void
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
    const offers: (() => void)[] = []
    const collect = new Set(['import-file', 'import-browser', 'settings-open']).has(command.action)
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
          offer: (perform) => {
            if (!settled && offers.length < 2) {
              offers.push(perform)
            }
          },
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
    if (collect) {
      if (Date.now() >= expiresAt) {
        finish(new Error('request_expired'))
      } else if (offers.length !== 1) {
        finish(
          new Error(
            offers.length ? 'browser_profile_ui_ambiguous' : 'browser_profile_ui_unavailable'
          )
        )
      } else {
        offers[0]()
      }
    } else if (!claimed) {
      finish(new Error('browser_profile_ui_unavailable'))
    }
  })
}
