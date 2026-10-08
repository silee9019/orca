import type { BrowserToolbarAction } from '../../../shared/rpc-contract/browser-viewer-params'
export type BrowserToolbarResult = {
  action: BrowserToolbarAction
  intent?: 'stop' | 'retry-guest-recovery' | 'retry-load' | 'reload' | 'hard-reload'
}
export type BrowserToolbarEvent = {
  page: string
  action: BrowserToolbarAction
  expiresAt: number
  claim: () => boolean
  finish: (error?: Error, result?: BrowserToolbarResult) => void
}
export const BROWSER_TOOLBAR_COMMAND_EVENT = 'orca:browser-toolbar-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-toolbar-command': CustomEvent<BrowserToolbarEvent>
  }
}
export function requestBrowserToolbar(
  page: string,
  action: BrowserToolbarAction,
  expiresAt: number
): BrowserToolbarResult {
  let claimed = false
  let result: BrowserToolbarResult | undefined
  let error: Error | undefined
  window.dispatchEvent(
    new CustomEvent(BROWSER_TOOLBAR_COMMAND_EVENT, {
      detail: {
        page,
        action,
        expiresAt,
        claim: () => {
          if (claimed) {
            return false
          }
          claimed = true
          return true
        },
        finish: (failure?: Error, outcome?: BrowserToolbarResult) => {
          error = failure
          result = outcome
        }
      }
    })
  )
  if (error) {
    throw error
  }
  if (!result) {
    throw new Error('browser_toolbar_unavailable')
  }
  return result
}
