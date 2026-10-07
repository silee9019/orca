import type {
  BrowserSetupGuideCommand,
  BrowserSetupGuideState
} from '../../../shared/rpc-contract/browser-setup-guide-params'
export const BROWSER_SETUP_GUIDE_EVENT = 'orca:browser-setup-guide-command'
export type BrowserSetupGuideEvent = {
  command: BrowserSetupGuideCommand
  expiresAt: number
  isSettled: () => boolean
  offer: (perform: () => void) => void
  finish: (error?: Error, state?: BrowserSetupGuideState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-setup-guide-command': CustomEvent<BrowserSetupGuideEvent>
  }
}
export function requestBrowserSetupGuide(
  command: BrowserSetupGuideCommand,
  expiresAt: number
): Promise<BrowserSetupGuideState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let settled = false
    const finish = (error?: Error, state?: BrowserSetupGuideState): void => {
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
      () => finish(new Error('browser_setup_guide_timeout_effect_unknown')),
      Math.max(0, Math.min(1500, expiresAt - Date.now()))
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_SETUP_GUIDE_EVENT, {
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
      finish(new Error('browser_setup_guide_request_expired'))
    } else if (offers.length !== 1) {
      finish(
        new Error(
          offers.length === 0
            ? 'browser_setup_guide_owner_unavailable'
            : 'browser_setup_guide_owner_ambiguous'
        )
      )
    } else {
      offers[0]()
    }
  })
}
