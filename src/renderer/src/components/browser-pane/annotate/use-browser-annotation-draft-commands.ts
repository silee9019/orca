import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import { useAppStore } from '@/store'
import { BROWSER_ANNOTATION_DRAFT_EVENT } from '@/runtime/browser-annotation-draft-request'
import type {
  BrowserAnnotationIntent,
  BrowserGrabPayload
} from '../../../../../shared/browser-grab-types'
export function useBrowserAnnotationDraftCommands(
  page: string,
  isActive: boolean,
  pending: MutableRefObject<BrowserGrabPayload | null>,
  add: (comment: string, intent: BrowserAnnotationIntent) => string | undefined,
  cancel: () => void
): void {
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-annotation-draft-command']): void => {
      const request = event.detail
      if (request.page !== page || !request.claim()) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (!isActive) {
        request.finish(new Error('browser_annotation_viewer_inactive'))
        return
      }
      if (request.command.action === 'add' && !pending.current) {
        request.finish(new Error('browser_annotation_draft_missing'))
        return
      }
      try {
        let annotationId: string | undefined
        if (request.command.action === 'add') {
          annotationId = add(request.command.comment, request.command.intent)
          const notes = useAppStore.getState().browserAnnotationsByPageId[page] ?? []
          if (!annotationId || !notes.some((note) => note.id === annotationId)) {
            request.finish(new Error('browser_annotation_add_failed'))
            return
          }
        } else if (request.command.action === 'cancel') {
          cancel()
        }
        request.finish(undefined, {
          hasDraft: pending.current !== null,
          ...(annotationId ? { annotationId } : {})
        })
      } catch {
        request.finish(new Error('browser_annotation_draft_failed'))
      }
    }
    window.addEventListener(BROWSER_ANNOTATION_DRAFT_EVENT, receive)
    return () => window.removeEventListener(BROWSER_ANNOTATION_DRAFT_EVENT, receive)
  }, [page, isActive, pending, add, cancel])
}
