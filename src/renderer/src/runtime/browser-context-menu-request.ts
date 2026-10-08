import type {
  BrowserContextMenuAction,
  BrowserContextMenuState
} from '../../../shared/rpc-contract/browser-context-menu-params'
export type BrowserContextMenuEvent = {
  page: string
  action: BrowserContextMenuAction
  expiresAt: number
  claim: () => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserContextMenuState) => void
}
export const BROWSER_CONTEXT_MENU_COMMAND_EVENT = 'orca:browser-context-menu-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-context-menu-command': CustomEvent<BrowserContextMenuEvent>
  }
}
export function requestBrowserContextMenu(
  page: string,
  action: BrowserContextMenuAction,
  expiresAt: number
): Promise<BrowserContextMenuState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserContextMenuState): void => {
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
      () => finish(new Error('browser_context_menu_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_CONTEXT_MENU_COMMAND_EVENT, {
        detail: {
          page,
          action,
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
      finish(new Error('browser_context_menu_unavailable'))
    }
  })
}
