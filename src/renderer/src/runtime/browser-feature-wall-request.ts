import type {
  BrowserFeatureWallCommand,
  BrowserFeatureWallState
} from '../../../shared/rpc-contract/browser-feature-wall-params'
export const BROWSER_FEATURE_WALL_EVENT = 'orca:browser-feature-wall-command'
export type BrowserFeatureWallEvent = {
  command: BrowserFeatureWallCommand
  expiresAt: number
  isSettled: () => boolean
  offer: (perform: () => void) => void
  finish: (error?: Error, state?: BrowserFeatureWallState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-feature-wall-command': CustomEvent<BrowserFeatureWallEvent>
  }
}
export function requestBrowserFeatureWall(
  command: BrowserFeatureWallCommand,
  expiresAt: number
): Promise<BrowserFeatureWallState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let settled = false
    const finish = (error?: Error, state?: BrowserFeatureWallState): void => {
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
      () => finish(new Error('browser_feature_wall_timeout_effect_unknown')),
      Math.max(0, Math.min(1500, expiresAt - Date.now()))
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_FEATURE_WALL_EVENT, {
        detail: {
          command,
          expiresAt,
          isSettled: () => settled,
          offer: (perform) => {
            if (!settled && offers.length < 2) {
              offers.push(perform)
            }
          },
          finish
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('browser_feature_wall_request_expired'))
    } else if (offers.length !== 1) {
      finish(
        new Error(
          offers.length === 0
            ? 'browser_feature_wall_owner_unavailable'
            : 'browser_feature_wall_owner_ambiguous'
        )
      )
    } else {
      offers[0]()
    }
  })
}
