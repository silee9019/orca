import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BROWSER_GRAB_COMMAND_EVENT, type BrowserGrabEvent } from '@/runtime/browser-grab-request'
import type { GrabModeHook } from './useGrabMode'
import type { GrabIntent } from '../../../../../shared/browser-grab-types'
export function useBrowserGrabIntentCommands(
  page: string,
  isActive: boolean,
  grab: GrabModeHook,
  intent: GrabIntent,
  start: (intent: GrabIntent) => void | Promise<boolean>,
  blocked = false
): void {
  const pending = useRef<{
    request: BrowserGrabEvent
    intent: GrabIntent
    idle: boolean
    nativeAccepted: boolean | null
  } | null>(null)
  const current = useRef({ grab, intent })
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = { grab, intent }
  })
  const snapshot = () => ({
    state: current.current.grab.state,
    hasSelection: current.current.grab.payload !== null,
    hasScreenshot: Boolean(current.current.grab.payload?.screenshot),
    contextMenu: current.current.grab.contextMenu,
    intent: current.current.intent
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
    if (blocked || !isActive || Date.now() >= operation.request.expiresAt) {
      operation.request.finish(new Error('browser_grab_toggle_owner_unavailable_effect_unknown'))
      pending.current = null
      return
    }
    const value = snapshot()
    if (operation.nativeAccepted === false || value.state === 'error') {
      operation.request.finish(new Error('browser_grab_toggle_native_rejected'))
      pending.current = null
    } else if (
      value.intent === operation.intent &&
      (operation.idle
        ? operation.nativeAccepted === true && value.state === 'idle'
        : value.state === 'awaiting' || value.state === 'confirming')
    ) {
      operation.request.finish(undefined, value)
      pending.current = null
    }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-grab-command']): void => {
      const request = event.detail
      if (
        request.page !== page ||
        (request.action !== 'intent-start' && request.action !== 'toggle') ||
        !request.claim()
      ) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (blocked) {
        request.finish(new Error('browser_grab_markup_active'))
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
      if (request.action === 'intent-start' && grab.state !== 'idle' && grab.state !== 'error') {
        request.finish(new Error('browser_grab_already_active'))
        return
      }
      if (request.intent !== 'copy' && request.intent !== 'annotate') {
        request.finish(new Error('invalid_grab_intent'))
        return
      }
      const operation: NonNullable<typeof pending.current> = {
        request,
        intent: request.intent,
        idle: grab.state !== 'idle' && grab.state !== 'error' && intent === request.intent,
        nativeAccepted: null
      }
      try {
        if (request.action === 'toggle') {
          pending.current = operation
        }
        const accepted = start(request.intent)
        if (request.action === 'intent-start') {
          request.finish(undefined, snapshot())
          return
        }
        if (operation.idle) {
          if (!accepted) {
            request.finish(new Error('browser_grab_toggle_native_ack_unavailable_effect_unknown'))
            pending.current = null
          } else {
            void accepted.then(
              (value) => {
                if (pending.current !== operation || request.isSettled()) {
                  return
                }
                operation.nativeAccepted = value
                update((value) => value + 1)
              },
              () => {
                if (pending.current !== operation) {
                  return
                }
                operation.nativeAccepted = false
                update((value) => value + 1)
              }
            )
          }
        } else {
          update((value) => value + 1)
        }
      } catch {
        request.finish(new Error('browser_grab_start_failed'))
        if (pending.current === operation) {
          pending.current = null
        }
      }
    }
    window.addEventListener(BROWSER_GRAB_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_GRAB_COMMAND_EVENT, receive)
  }, [page, isActive, grab, intent, start, blocked])
  useEffect(
    () => () => {
      pending.current?.request.finish(
        new Error('browser_grab_toggle_owner_unavailable_effect_unknown')
      )
      pending.current = null
    },
    [page]
  )
}
