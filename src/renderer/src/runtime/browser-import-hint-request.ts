import type {
  BrowserImportHintCommand,
  BrowserImportHintState
} from '../../../shared/rpc-contract/browser-import-hint-params'
export const BROWSER_IMPORT_HINT_EVENT = 'orca:browser-import-hint-command'
export type BrowserImportHintEvent = {
  command: BrowserImportHintCommand
  expiresAt: number
  isSettled: () => boolean
  offer: (perform: () => void) => void
  finish: (error?: Error, state?: BrowserImportHintState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-import-hint-command': CustomEvent<BrowserImportHintEvent>
  }
}
export function requestBrowserImportHint(
  command: BrowserImportHintCommand,
  expiresAt: number
): Promise<BrowserImportHintState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let settled = false
    const finish = (error?: Error, state?: BrowserImportHintState): void => {
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
      () => finish(new Error('browser_import_hint_timeout_effect_unknown')),
      Math.max(0, Math.min(1500, expiresAt - Date.now()))
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_IMPORT_HINT_EVENT, {
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
      finish(new Error('browser_import_hint_request_expired'))
    } else if (offers.length !== 1) {
      finish(
        new Error(
          offers.length === 0
            ? 'browser_import_hint_owner_unavailable'
            : 'browser_import_hint_owner_ambiguous'
        )
      )
    } else {
      offers[0]()
    }
  })
}
