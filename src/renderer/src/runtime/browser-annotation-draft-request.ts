import type { BrowserAnnotationIntent } from '../../../shared/browser-grab-types'
export type BrowserAnnotationDraftCommand =
  | { action: 'status' | 'cancel' }
  | { action: 'add'; comment: string; intent: BrowserAnnotationIntent }
export type BrowserAnnotationDraftResult = { hasDraft: boolean; annotationId?: string }
export type BrowserAnnotationDraftEvent = {
  page: string
  command: BrowserAnnotationDraftCommand
  expiresAt: number
  claim: () => boolean
  finish: (error?: Error, result?: BrowserAnnotationDraftResult) => void
}
export const BROWSER_ANNOTATION_DRAFT_EVENT = 'orca:browser-annotation-draft-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-annotation-draft-command': CustomEvent<BrowserAnnotationDraftEvent>
  }
}
export function requestBrowserAnnotationDraft(
  page: string,
  command: BrowserAnnotationDraftCommand,
  expiresAt: number
): BrowserAnnotationDraftResult {
  let claimed = false
  let result: BrowserAnnotationDraftResult | undefined
  let error: Error | undefined
  window.dispatchEvent(
    new CustomEvent(BROWSER_ANNOTATION_DRAFT_EVENT, {
      detail: {
        page,
        command,
        expiresAt,
        claim: () => {
          if (claimed) {
            return false
          }
          claimed = true
          return true
        },
        finish: (failure?: Error, value?: BrowserAnnotationDraftResult) => {
          error = failure
          result = value
        }
      }
    })
  )
  if (error) {
    throw error
  }
  if (!result) {
    throw new Error('browser_annotation_draft_ui_unavailable')
  }
  return result
}
