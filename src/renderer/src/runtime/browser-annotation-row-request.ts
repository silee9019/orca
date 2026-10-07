import type {
  BrowserAnnotationRowCommand,
  BrowserAnnotationRowState
} from '../../../shared/rpc-contract/browser-annotation-row-params'
export type BrowserAnnotationRowEvent = {
  page: string
  command: BrowserAnnotationRowCommand
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserAnnotationRowState) => void
}
export const BROWSER_ANNOTATION_ROW_COMMAND_EVENT = 'orca:browser-annotation-row-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-annotation-row-command': CustomEvent<BrowserAnnotationRowEvent>
  }
}
export function requestBrowserAnnotationRow(
  page: string,
  command: BrowserAnnotationRowCommand,
  expiresAt: number
): Promise<BrowserAnnotationRowState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
    let settled = false
    const finish = (error?: Error, state?: BrowserAnnotationRowState): void => {
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
      () => finish(new Error('annotation_row_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_ANNOTATION_ROW_COMMAND_EVENT, {
        detail: {
          page,
          command,
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
      finish(new Error('browser_annotation_row_owner_ambiguous'))
    } else if (offers.length === 0) {
      finish(
        new Error(
          matchingOwners
            ? 'browser_annotation_row_inactive'
            : 'browser_annotation_row_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
