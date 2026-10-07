import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BROWSER_MARKUP_COMMAND_EVENT,
  type BrowserMarkupEvent,
  type BrowserMarkupState
} from '@/runtime/browser-markup-request'
import type { MarkupModeController } from './useMarkupMode'

export function useBrowserMarkupCommands(
  page: string,
  active: boolean,
  mode: MarkupModeController
): void {
  const current = useRef<BrowserMarkupState>({ state: mode.state, hasImage: !!mode.baseImage })
  const pending = useRef<{ request: BrowserMarkupEvent; done: boolean } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = { state: mode.state, hasImage: !!mode.baseImage }
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    if (operation.request.isSettled()) {
      pending.current = null
    } else if (!active) {
      operation.request.finish(new Error('browser_markup_viewer_inactive_effect_unknown'))
      pending.current = null
    } else if (operation.done) {
      const snapshot = current.current
      const accepted =
        operation.request.action === 'start'
          ? snapshot.state === 'drawing' && snapshot.hasImage
          : snapshot.state === 'idle' && !snapshot.hasImage
      operation.request.finish(
        accepted ? undefined : new Error('browser_markup_capture_failed'),
        snapshot
      )
      pending.current = null
    }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-markup-command']): void => {
      const request = event.detail
      if (request.page !== page || !request.claim()) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (!active) {
        request.finish(new Error('browser_markup_viewer_inactive'))
        return
      }
      if (request.action === 'status') {
        request.finish(undefined, current.current)
        return
      }
      if (pending.current?.request.isSettled()) {
        pending.current = null
      }
      if (request.action === 'cancel') {
        pending.current?.request.finish(new Error('browser_markup_cancelled'))
        pending.current = { request, done: true }
        mode.cancel()
        update((value) => value + 1)
        return
      }
      if (pending.current || current.current.state !== 'idle') {
        request.finish(new Error('browser_markup_already_active'))
        return
      }
      const operation = { request, done: false }
      pending.current = operation
      void mode.start().then(
        () => {
          if (pending.current !== operation || request.isSettled()) {
            return
          }
          operation.done = true
          update((value) => value + 1)
        },
        () => {
          request.finish(new Error('browser_markup_capture_failed'))
          if (pending.current === operation) {
            pending.current = null
          }
        }
      )
    }
    window.addEventListener(BROWSER_MARKUP_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_MARKUP_COMMAND_EVENT, receive)
  }, [page, active, mode])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_markup_ui_unavailable'))
      pending.current = null
    },
    [page]
  )
}
