import type {
  BrowserDocumentCommand,
  BrowserDocumentState
} from '../../../shared/rpc-contract/browser-document-params'

export type BrowserDocumentEvent = {
  page: string
  command: BrowserDocumentCommand
  expiresAt: number
  claim: () => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserDocumentState) => void
}
export const BROWSER_DOCUMENT_COMMAND_EVENT = 'orca:browser-document-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-document-command': CustomEvent<BrowserDocumentEvent>
  }
}
export function requestBrowserDocument(
  page: string,
  command: BrowserDocumentCommand,
  expiresAt: number
): Promise<BrowserDocumentState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserDocumentState): void => {
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
        reject(new Error('browser_document_invalid_response'))
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('browser_document_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_DOCUMENT_COMMAND_EVENT, {
        detail: {
          page,
          command,
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
      finish(new Error('browser_document_owner_unavailable'))
    }
  })
}
