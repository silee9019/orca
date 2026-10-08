import type {
  FloatingBrowserCommand,
  FloatingBrowserState
} from '../../../shared/rpc-contract/floating-browser-params'
export const FLOATING_BROWSER_EVENT = 'orca:floating-browser-command'
export type FloatingBrowserEvent = {
  command: FloatingBrowserCommand
  expiresAt: number
  claim: () => boolean
  finish: (error?: Error, state?: FloatingBrowserState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:floating-browser-command': CustomEvent<FloatingBrowserEvent>
  }
}
export function requestFloatingBrowser(
  command: FloatingBrowserCommand,
  expiresAt: number
): FloatingBrowserState {
  let claimed = false
  let state: FloatingBrowserState | undefined
  let error: Error | undefined
  window.dispatchEvent(
    new CustomEvent(FLOATING_BROWSER_EVENT, {
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
        finish: (failure?: Error, result?: FloatingBrowserState) => {
          error = failure
          state = result
        }
      }
    })
  )
  if (error) {
    throw error
  }
  if (!state) {
    throw new Error('floating_browser_owner_unavailable')
  }
  return state
}
