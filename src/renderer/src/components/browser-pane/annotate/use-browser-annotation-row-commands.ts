import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BROWSER_ANNOTATION_ROW_COMMAND_EVENT,
  type BrowserAnnotationRowEvent
} from '@/runtime/browser-annotation-row-request'
import type { BrowserAnnotationRowState } from '../../../../../shared/rpc-contract/browser-annotation-row-params'
import type { useBrowserAnnotationRowEditor } from './use-browser-annotation-row-editor'
type Editor = ReturnType<typeof useBrowserAnnotationRowEditor>
function snapshot(editor: Editor): BrowserAnnotationRowState {
  return {
    editingAnnotationId: editor.editingAnnotationId,
    comment: editor.editComment,
    intent: editor.editIntent
  }
}
export function useBrowserAnnotationRowCommands(
  owner: { page: string; active: boolean } | undefined,
  editor: Editor
): void {
  const current = useRef({ owner, editor })
  const pending = useRef<{
    request: BrowserAnnotationRowEvent
    check: (editor: Editor) => boolean
    savedAnnotationId?: string
  } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = { owner, editor }
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    if (operation.request.isSettled()) {
      pending.current = null
      return
    }
    if (
      !owner?.active ||
      owner.page !== operation.request.page ||
      Date.now() >= operation.request.expiresAt
    ) {
      operation.request.finish(new Error('browser_annotation_row_owner_changed_effect_unknown'))
    } else {
      operation.request.finish(
        operation.check(editor) ? undefined : new Error('browser_annotation_row_not_applied'),
        {
          ...snapshot(editor),
          ...(operation.savedAnnotationId ? { savedAnnotationId: operation.savedAnnotationId } : {})
        }
      )
    }
    pending.current = null
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-annotation-row-command']): void => {
      const request = event.detail
      const state = current.current
      if (!state.owner || request.page !== state.owner.page) {
        return
      }
      request.offer(state.owner.active, () => {
        if (!current.current.owner?.active || current.current.owner.page !== request.page) {
          request.finish(new Error('browser_annotation_row_owner_changed_effect_unknown'))
          return
        }
        if (Date.now() >= request.expiresAt) {
          request.finish(new Error('request_expired'))
          return
        }
        const before = current.current.editor
        const command = request.command
        if (command.action === 'status') {
          request.finish(undefined, snapshot(before))
          return
        }
        if (pending.current && !pending.current.request.isSettled()) {
          request.finish(new Error('browser_annotation_row_busy'))
          return
        }
        try {
          let check: (editor: Editor) => boolean
          let savedAnnotationId: string | undefined
          if (command.action === 'start') {
            const annotation = before.browserAnnotations.find(
              (item) => item.id === command.annotationId
            )
            if (!annotation) {
              throw new Error('browser_annotation_row_missing')
            }
            before.handleStartEdit(annotation)
            check = (value) =>
              value.editingAnnotationId === annotation.id &&
              value.editComment === annotation.comment &&
              value.editIntent === annotation.intent
          } else {
            const id = before.editingAnnotationId
            if (!id) {
              throw new Error('browser_annotation_row_not_editing')
            }
            if (command.action === 'comment') {
              before.setEditComment(command.value)
              check = (value) =>
                value.editingAnnotationId === id && value.editComment === command.value
            } else if (command.action === 'intent') {
              before.setEditIntent(command.value)
              check = (value) =>
                value.editingAnnotationId === id && value.editIntent === command.value
            } else if (command.action === 'cancel') {
              before.handleCancelEdit()
              check = (value) => value.editingAnnotationId === null
            } else {
              const trimmed = before.editComment.trim()
              if (!trimmed) {
                throw new Error('browser_annotation_row_empty_comment')
              }
              before.handleSaveEdit()
              savedAnnotationId = id
              check = (value) =>
                value.editingAnnotationId === null &&
                value.browserAnnotations.some(
                  (annotation) =>
                    annotation.id === id &&
                    annotation.comment === trimmed &&
                    annotation.intent === before.editIntent
                )
            }
          }
          pending.current = { request, check, ...(savedAnnotationId ? { savedAnnotationId } : {}) }
          update((value) => value + 1)
        } catch (error) {
          request.finish(
            error instanceof Error
              ? error
              : new Error('browser_annotation_row_failed_effect_unknown')
          )
        }
      })
    }

    window.addEventListener(BROWSER_ANNOTATION_ROW_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_ANNOTATION_ROW_COMMAND_EVENT, receive)
  }, [])
  useEffect(
    () => () => {
      pending.current?.request.finish(
        new Error('browser_annotation_row_unavailable_effect_unknown')
      )
      pending.current = null
    },
    [owner?.page]
  )
}
