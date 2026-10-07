import type {
  LinkedBrowserCommand,
  LinkedBrowserState
} from '../../../shared/rpc-contract/linked-browser-params'
export const LINKED_BROWSER_EVENT = 'orca:linked-browser-command'
export type LinkedBrowserEvent = {
  command: LinkedBrowserCommand
  expiresAt: number
  claim: () => boolean
  finish: (error?: Error, state?: LinkedBrowserState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:linked-browser-command': CustomEvent<LinkedBrowserEvent>
  }
}
export function requestLinkedBrowser(
  command: LinkedBrowserCommand,
  expiresAt: number
): Promise<LinkedBrowserState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    const timer = setTimeout(
      () => reject(new Error('linked_browser_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(LINKED_BROWSER_EVENT, {
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
          finish: (error?: Error, state?: LinkedBrowserState) => {
            clearTimeout(timer)
            if (error || !state) {
              reject(error ?? new Error('linked_browser_readback_missing'))
              return
            }
            resolve(state)
          }
        }
      })
    )
    if (!claimed) {
      clearTimeout(timer)
      reject(new Error('linked_browser_owner_unavailable'))
    }
  })
}
