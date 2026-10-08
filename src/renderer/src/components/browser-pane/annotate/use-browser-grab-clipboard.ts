import { writeVerifiedClipboardText } from '@/runtime/clipboard-text-write'
import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { BROWSER_GRAB_COMMAND_EVENT, type BrowserGrabEvent } from '@/runtime/browser-grab-request'
import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'
import type { GrabModeHook } from './useGrabMode'
import { formatGrabPayloadAsText } from './GrabConfirmationSheet'
import {
  copiedGrabToastMessage,
  screenshottedGrabToastMessage
} from './browser-grab-toast-messages'
export function useBrowserGrabClipboard({
  page,
  isActive,
  grab,
  payloadRef,
  menuActionTaken,
  record,
  toast
}: {
  page: string
  isActive: boolean
  grab: GrabModeHook
  payloadRef: MutableRefObject<BrowserGrabPayload | null>
  menuActionTaken: MutableRefObject<boolean>
  record: (feature: 'browser-grab') => void | Promise<void>
  toast: (message: string, type: 'success' | 'error', payload: BrowserGrabPayload) => void
}): { handleGrabCopy: () => void; handleGrabCopyScreenshot: () => void } {
  const pending = useRef<{ request: BrowserGrabEvent; copied: boolean } | null>(null)
  const current = useRef(grab)
  useLayoutEffect(() => {
    current.current = grab
  })
  const copy = useCallback(
    async (
      image: boolean,
      verified: boolean,
      stillCurrent: () => boolean = () => true
    ): Promise<boolean> => {
      menuActionTaken.current = true
      const payload = payloadRef.current
      if (!payload) {
        return false
      }
      try {
        if (image) {
          const dataUrl = payload.screenshot?.dataUrl
          if (!dataUrl?.startsWith('data:image/png;base64,')) {
            return false
          }
          if (verified) {
            const ack = await window.api.ui.writeVerifiedClipboardImage(dataUrl)
            if (ack.written !== true) {
              return false
            }
          } else {
            void window.api.ui.writeClipboardImage(dataUrl)
          }
        } else {
          const text = formatGrabPayloadAsText(payload)
          if (verified) {
            if (!(await writeVerifiedClipboardText(text))) {
              return false
            }
          } else {
            void window.api.ui.writeClipboardText(text)
          }
        }
        if (payloadRef.current !== payload || !stillCurrent()) {
          return false
        }
        record('browser-grab')
        toast(
          image ? screenshottedGrabToastMessage() : copiedGrabToastMessage(),
          'success',
          payload
        )
        current.current.rearm()
        return true
      } catch {
        return false
      }
    },
    [menuActionTaken, payloadRef, record, toast]
  )
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    if (operation.request.isSettled()) {
      pending.current = null
      return
    }
    if (operation.copied && grab.payload === null && grab.state !== 'confirming') {
      if (grab.state === 'error') {
        operation.request.finish(new Error('browser_grab_rearm_failed_after_copy'))
      } else {
        operation.request.finish(undefined, {
          state: grab.state,
          hasSelection: false,
          hasScreenshot: false,
          contextMenu: grab.contextMenu
        })
      }
      pending.current = null
    }
  }, [grab])
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-grab-command']): void => {
      const request = event.detail
      if (
        request.page !== page ||
        (request.action !== 'copy' && request.action !== 'copy-screenshot') ||
        !request.claim()
      ) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (!isActive) {
        request.finish(new Error('browser_grab_viewer_inactive'))
        return
      }
      if (pending.current && !pending.current.request.isSettled()) {
        request.finish(new Error('browser_grab_busy'))
        return
      }
      if (current.current.state !== 'confirming' || !payloadRef.current) {
        request.finish(new Error('browser_grab_not_confirming'))
        return
      }
      const operation = { request, copied: false }
      pending.current = operation
      void copy(
        request.action === 'copy-screenshot',
        true,
        () => !request.isSettled() && Date.now() < request.expiresAt
      ).then((copied) => {
        if (pending.current !== operation) {
          return
        }
        if (!copied) {
          request.finish(new Error('browser_grab_copy_failed_effect_unknown'))
          pending.current = null
          return
        }
        operation.copied = true
        const snapshot = current.current
        if (snapshot.payload === null && snapshot.state !== 'confirming') {
          request.finish(undefined, {
            state: snapshot.state,
            hasSelection: false,
            hasScreenshot: false,
            contextMenu: snapshot.contextMenu
          })
          pending.current = null
        }
      })
    }
    window.addEventListener(BROWSER_GRAB_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_GRAB_COMMAND_EVENT, receive)
  }, [page, isActive, copy, payloadRef])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_grab_ui_unavailable'))
      pending.current = null
    },
    [page]
  )
  return {
    handleGrabCopy: () => {
      void copy(false, false)
    },
    handleGrabCopyScreenshot: () => {
      void copy(true, false)
    }
  }
}
