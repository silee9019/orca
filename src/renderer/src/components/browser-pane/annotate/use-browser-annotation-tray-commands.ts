import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BROWSER_ANNOTATION_TRAY_COMMAND_EVENT,
  type BrowserAnnotationTrayEvent
} from '@/runtime/browser-annotation-tray-request'
import type { BrowserAnnotationTrayState } from '../../../../../shared/rpc-contract/browser-annotation-tray-params'
import type { useBrowserPageAnnotationSend } from './use-browser-page-annotation-send'
type Controller = ReturnType<typeof useBrowserPageAnnotationSend>
function snapshot(controller: Controller): BrowserAnnotationTrayState {
  return {
    noteCount: controller.browserAnnotations.length,
    open: controller.browserAnnotationTrayOpen,
    copied: controller.browserAnnotationsCopied,
    sendMenuOpen: controller.annotationTraySendOpen
  }
}
export function useBrowserAnnotationTrayCommands(
  owner: { page: string; active: boolean } | undefined,
  controller: Controller
): void {
  const current = useRef(controller)
  const currentOwner = useRef(owner)
  const pending = useRef<{
    request: BrowserAnnotationTrayEvent
    done: boolean
    check: (state: BrowserAnnotationTrayState) => boolean
  } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = controller
    currentOwner.current = owner
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
    if (!currentOwner.current?.active) {
      operation.request.finish(new Error('browser_annotation_viewer_inactive_effect_unknown'))
      pending.current = null
    } else if (operation.done) {
      const state = snapshot(current.current)
      operation.request.finish(
        operation.check(state) ? undefined : new Error('browser_annotation_tray_not_applied'),
        state
      )
      pending.current = null
    }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-annotation-tray-command']): void => {
      const request = event.detail
      if (!owner || request.page !== owner.page || !request.claim()) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (!owner.active) {
        request.finish(new Error('browser_annotation_viewer_inactive'))
        return
      }
      const before = current.current
      if (request.action === 'status') {
        request.finish(undefined, snapshot(before))
        return
      }
      if (pending.current && !pending.current.request.isSettled()) {
        request.finish(new Error('browser_annotation_tray_busy'))
        return
      }
      if (request.action === 'copy' && before.browserAnnotations.length === 0) {
        request.finish(new Error('browser_annotations_empty'))
        return
      }
      if (request.action === 'send-menu-open' && !before.browserAnnotationsPrompt) {
        request.finish(new Error('browser_annotations_send_unavailable'))
        return
      }
      if (request.action === 'copy') {
        const operation = {
          request,
          done: false,
          check: (state: BrowserAnnotationTrayState) => state.copied
        }
        pending.current = operation
        void before
          .copyBrowserAnnotationsVerified(
            () =>
              pending.current === operation &&
              !request.isSettled() &&
              !!currentOwner.current?.active
          )
          .then(
            (copied) => {
              if (pending.current !== operation || request.isSettled()) {
                return
              }
              if (!copied) {
                request.finish(new Error('browser_annotation_copy_failed_effect_unknown'))
                pending.current = null
                return
              }
              operation.done = true
              update((value) => value + 1)
            },
            () => {
              request.finish(new Error('browser_annotation_copy_failed_effect_unknown'))
              if (pending.current === operation) {
                pending.current = null
              }
            }
          )
        return
      }
      try {
        let check: (state: BrowserAnnotationTrayState) => boolean
        if (request.action === 'open' || request.action === 'close') {
          const open = request.action === 'open'
          before.setBrowserAnnotationTrayOpen(open)
          check = (state) => state.open === open
        } else if (request.action === 'clear') {
          before.handleClearBrowserAnnotations()
          check = (state) => state.noteCount === 0 && !state.copied
        } else {
          const open = request.action === 'send-menu-open'
          before.handleAnnotationTraySendOpenChange(open)
          check = (state) => state.sendMenuOpen === open
        }
        pending.current = { request, done: true, check }
        update((value) => value + 1)
      } catch {
        request.finish(new Error('browser_annotation_tray_failed'))
      }
    }
    window.addEventListener(BROWSER_ANNOTATION_TRAY_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_ANNOTATION_TRAY_COMMAND_EVENT, receive)
  }, [owner])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_annotation_tray_ui_unavailable'))
      pending.current = null
    },
    [owner?.page]
  )
}
