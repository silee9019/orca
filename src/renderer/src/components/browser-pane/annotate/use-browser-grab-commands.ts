import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  BROWSER_GRAB_COMMAND_EVENT,
  type BrowserGrabEvent,
  type BrowserGrabState
} from '@/runtime/browser-grab-request'

type Controller = {
  state: BrowserGrabState
  start: () => void
  rearm: () => void
  cancel: () => Promise<boolean>
  exit: () => Promise<boolean>
}
export function useBrowserGrabCommands(page: string, controller: Controller): void {
  const current = useRef(controller.state)
  const pending = useRef<{ request: BrowserGrabEvent; nativeAccepted: boolean | null } | null>(null)
  const settle = (): void => {
    const operation = pending.current
    if (!operation) {
      return
    }
    const snapshot = current.current
    if (operation.request.isSettled()) {
      pending.current = null
      return
    }
    if (
      operation.request.action === 'start' ||
      operation.request.action === 'rearm' ||
      operation.request.action === 'await-ready'
    ) {
      if (snapshot.state === 'error') {
        operation.request.finish(new Error('browser_grab_start_failed'))
        pending.current = null
      } else if (snapshot.state === 'awaiting' || snapshot.state === 'confirming') {
        operation.request.finish(undefined, snapshot)
        pending.current = null
      }
    } else if (operation.nativeAccepted === true && snapshot.state === 'idle') {
      operation.request.finish(undefined, snapshot)
      pending.current = null
    }
  }
  useLayoutEffect(() => {
    current.current = controller.state
  })
  useEffect(settle)
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-grab-command']): void => {
      const request = event.detail
      if (
        request.page !== page ||
        request.action === 'intent-start' ||
        request.action === 'copy' ||
        request.action === 'copy-screenshot' ||
        !request.claim()
      ) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (pending.current?.request.isSettled()) {
        pending.current = null
      }
      if (pending.current) {
        request.finish(new Error('browser_grab_busy'))
        return
      }
      const snapshot = current.current
      if (request.action === 'status') {
        request.finish(undefined, snapshot)
        return
      }
      if (request.action === 'start' && snapshot.state !== 'idle' && snapshot.state !== 'error') {
        request.finish(new Error('browser_grab_already_active'))
        return
      }
      if (request.action === 'rearm' && snapshot.state !== 'confirming') {
        request.finish(new Error('browser_grab_not_confirming'))
        return
      }
      const operation: { request: BrowserGrabEvent; nativeAccepted: boolean | null } = {
        request,
        nativeAccepted: null
      }
      pending.current = operation
      if (request.action === 'await-ready') {
        settle()
        return
      }
      if (request.action === 'start') {
        controller.start()
      } else if (request.action === 'rearm') {
        controller.rearm()
      } else {
        void (request.action === 'cancel' ? controller.cancel() : controller.exit()).then(
          (accepted) => {
            if (pending.current !== operation) {
              return
            }
            if (!accepted) {
              request.finish(new Error('browser_grab_native_rejected'))
              pending.current = null
              return
            }
            operation.nativeAccepted = true
            settle()
          },
          () => {
            request.finish(new Error('browser_grab_native_rejected'))
            if (pending.current === operation) {
              pending.current = null
            }
          }
        )
      }
    }
    window.addEventListener(BROWSER_GRAB_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_GRAB_COMMAND_EVENT, receive)
  }, [page, controller])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_grab_ui_unavailable'))
      pending.current = null
    },
    [page]
  )
}
