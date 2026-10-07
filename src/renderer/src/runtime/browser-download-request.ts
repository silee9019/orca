import type {
  BrowserDownloadAction,
  BrowserDownloadReceipt
} from '../../../shared/rpc-contract/browser-download-params'
export type BrowserDownloadEvent = {
  page: string
  downloadId: string
  action: BrowserDownloadAction
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserDownloadReceipt) => void
}
export const BROWSER_DOWNLOAD_COMMAND_EVENT = 'orca:browser-download-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-download-command': CustomEvent<BrowserDownloadEvent>
  }
}
export function requestBrowserDownload(
  page: string,
  downloadId: string,
  action: BrowserDownloadAction,
  expiresAt: number
): Promise<BrowserDownloadReceipt> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
    let settled = false
    const finish = (error?: Error, state?: BrowserDownloadReceipt): void => {
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
      () => finish(new Error('download_ui_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_DOWNLOAD_COMMAND_EVENT, {
        detail: {
          page,
          downloadId,
          action,
          expiresAt,
          isSettled: () => settled,
          offer: (active: boolean, execute: () => void) => {
            matchingOwners += 1
            if (active) {
              offers.push(execute)
            }
          },
          finish
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length > 1) {
      finish(new Error('browser_download_ui_owner_ambiguous'))
    } else if (offers.length === 0) {
      finish(
        new Error(
          matchingOwners ? 'browser_download_ui_inactive' : 'browser_download_ui_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
