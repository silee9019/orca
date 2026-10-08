import type {
  BrowserRemotePaneCommand,
  BrowserRemotePaneState
} from '../../../shared/rpc-contract/browser-remote-pane-params'

export const REMOTE_BROWSER_PANE_COMMAND_EVENT = 'orca:remote-browser-pane-command'
export type RemoteBrowserPaneEvent = {
  page: string
  command: BrowserRemotePaneCommand
  expiresAt: number
  claim: () => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserRemotePaneState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:remote-browser-pane-command': CustomEvent<RemoteBrowserPaneEvent>
  }
}
export function requestRemoteBrowserPane(
  page: string,
  command: BrowserRemotePaneCommand,
  expiresAt: number
): Promise<BrowserRemotePaneState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserRemotePaneState): void => {
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
        reject(new Error('invalid_remote_browser_pane_receipt'))
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('remote_browser_pane_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(REMOTE_BROWSER_PANE_COMMAND_EVENT, {
        detail: {
          page,
          command,
          expiresAt,
          finish,
          isSettled: () => settled,
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
      finish(new Error('remote_browser_pane_unavailable'))
    }
  })
}
