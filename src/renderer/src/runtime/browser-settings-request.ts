import type {
  BrowserSettingsCommand,
  BrowserSettingsState
} from '../../../shared/rpc-contract/browser-settings-params'
export type BrowserSettingsEvent = {
  command: BrowserSettingsCommand
  expiresAt: number
  hostId: string
  isSettled: () => boolean
  claim: () => boolean
  finish: (error?: Error, state?: BrowserSettingsState) => void
}
export const BROWSER_SETTINGS_EVENT = 'orca:browser-settings-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-settings-command': CustomEvent<BrowserSettingsEvent>
  }
}
export function requestBrowserSettings(
  command: BrowserSettingsCommand,
  expiresAt: number,
  hostId = 'local'
): Promise<BrowserSettingsState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserSettingsState): void => {
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
      () => finish(new Error('browser_settings_timeout_effect_unknown')),
      Math.max(0, Math.min(1500, expiresAt - Date.now()))
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_SETTINGS_EVENT, {
        detail: {
          command,
          expiresAt,
          hostId,
          isSettled: () => settled,
          claim: () => {
            if (claimed || settled || Date.now() >= expiresAt) {
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
      finish(new Error('browser_settings_owner_unavailable'))
    }
  })
}
