import type {
  BrowserRemoteFailureCommand,
  BrowserRemoteFailureState,
  BrowserRemotePaneCommand
} from '../../../shared/rpc-contract/browser-remote-pane-params'
type ExactRemoteFailureCommand = BrowserRemoteFailureCommand &
  Pick<BrowserRemotePaneCommand, 'environmentId' | 'expectedRemotePageId'>
export type RemoteBrowserFailureEvent = {
  page: string
  command: ExactRemoteFailureCommand
  expiresAt: number
  claim: () => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserRemoteFailureState) => void
}
export const REMOTE_BROWSER_FAILURE_EVENT = 'orca:remote-browser-failure-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:remote-browser-failure-command': CustomEvent<RemoteBrowserFailureEvent>
  }
}
export function requestRemoteBrowserFailure(
  page: string,
  command: ExactRemoteFailureCommand,
  expiresAt: number
): Promise<BrowserRemoteFailureState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserRemoteFailureState): void => {
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
        reject(new Error('invalid_remote_browser_failure_receipt'))
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('remote_browser_failure_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(REMOTE_BROWSER_FAILURE_EVENT, {
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
      finish(new Error('remote_browser_failure_owner_unavailable'))
    }
  })
}
