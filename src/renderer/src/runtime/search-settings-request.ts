import type {
  SearchSettingsViewerCommand,
  SearchSettingsViewerResult
} from '../../../shared/search-settings-viewer'

export type SearchSettingsResult = Omit<SearchSettingsViewerResult, 'viewerId'>
export type SearchSettingsEvent = {
  command: SearchSettingsViewerCommand
  expiresAt: number
  claim: () => boolean
  finish: (error?: Error, result?: SearchSettingsResult) => void
}
export const SEARCH_SETTINGS_COMMAND_EVENT = 'orca:search-settings-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:search-settings-command': CustomEvent<SearchSettingsEvent>
  }
}

export function requestSearchSettings(
  command: SearchSettingsViewerCommand,
  expiresAt: number
): Promise<SearchSettingsResult> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, result?: SearchSettingsResult): void => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (result) {
        resolve(result)
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('search_settings_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(SEARCH_SETTINGS_COMMAND_EVENT, {
        detail: {
          command,
          expiresAt,
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
      finish(new Error('search_settings_owner_unavailable'))
    }
  })
}
