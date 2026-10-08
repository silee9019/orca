import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BROWSER_GRAB_ACTION_EVENT,
  type BrowserGrabActionEvent
} from '@/runtime/browser-grab-action-request'
import {
  runBrowserGrabActionShortcut,
  type BrowserGrabActionArgs,
  type BrowserGrabActionOutcome
} from './browser-page-grab-action'
type Owner = Omit<BrowserGrabActionArgs, 'key'> & {
  commandOwner?: { page: string; active: boolean }
  markupIsActive: boolean
}
export function useBrowserGrabActionCommands(owner: Owner): (key: 'c' | 's') => void {
  const current = useRef(owner)
  const mounted = useRef(true)
  const pending = useRef<{
    request: BrowserGrabActionEvent
    captureGeneration: number
    outcome?: BrowserGrabActionOutcome
  } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = owner
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
    const snapshot = current.current
    if (!snapshot.commandOwner?.active || snapshot.markupIsActive) {
      operation.request.finish(new Error('browser_grab_action_owner_changed_effect_unknown'))
      pending.current = null
      return
    }
    if (!operation.outcome) {
      return
    }
    if (
      snapshot.grab.getCaptureGeneration?.() !==
      operation.captureGeneration + (operation.outcome.rearmed ? 1 : 0)
    ) {
      operation.request.finish(new Error('browser_grab_action_owner_changed_effect_unknown'))
      pending.current = null
      return
    }
    if (snapshot.grab.state === 'error') {
      operation.request.finish(new Error('browser_grab_action_rearm_failed_after_copy'))
      pending.current = null
      return
    }
    if (
      operation.outcome.rearmed &&
      (snapshot.grab.state === 'confirming' || snapshot.grab.payload)
    ) {
      return
    }
    operation.request.finish(undefined, {
      copied: true,
      source: operation.outcome.source,
      state: snapshot.grab.state,
      hasSelection: snapshot.grab.payload !== null,
      hasScreenshot: !!snapshot.grab.payload?.screenshot,
      contextMenu: snapshot.grab.contextMenu
    })
    pending.current = null
  })
  useEffect(() => {
    mounted.current = true
    const receive = (event: WindowEventMap['orca:browser-grab-action-command']): void => {
      const request = event.detail
      if (!current.current.commandOwner || request.page !== current.current.commandOwner.page) {
        return
      }
      request.offer(current.current.commandOwner?.active === true, () => {
        const snapshot = current.current
        if (snapshot.markupIsActive || snapshot.grabIntent !== 'copy') {
          request.finish(new Error('browser_grab_action_blocked'))
          return
        }
        if (
          snapshot.grab.state !== 'armed' &&
          snapshot.grab.state !== 'awaiting' &&
          snapshot.grab.state !== 'confirming'
        ) {
          request.finish(new Error('browser_grab_action_not_ready'))
          return
        }
        if (pending.current && !pending.current.request.isSettled()) {
          request.finish(new Error('browser_grab_action_busy'))
          return
        }
        const generation = snapshot.grab.getCaptureGeneration?.()
        if (generation === undefined) {
          request.finish(new Error('browser_grab_action_capture_owner_unverifiable'))
          return
        }
        const payload = snapshot.grabPayloadRef.current
        const operation: {
          request: BrowserGrabActionEvent
          captureGeneration: number
          outcome?: BrowserGrabActionOutcome
        } = {
          request,
          captureGeneration: generation
        }
        pending.current = operation
        const stillCurrent = (): boolean =>
          mounted.current &&
          pending.current === operation &&
          !request.isSettled() &&
          Date.now() < request.expiresAt &&
          current.current.commandOwner?.active === true &&
          !current.current.markupIsActive &&
          current.current.grabIntent === 'copy' &&
          current.current.grab.getCaptureGeneration?.() === generation &&
          current.current.toolTargetIdRef.current === request.page &&
          current.current.grab.state === snapshot.grab.state &&
          current.current.grab.contextMenu === snapshot.grab.contextMenu &&
          current.current.grabPayloadRef.current === payload
        void runBrowserGrabActionShortcut({
          ...snapshot,
          key: request.key === 'copy' ? 'c' : 's',
          verified: { stillCurrent }
        }).then(
          (outcome) => {
            if (pending.current !== operation) {
              return
            }
            if (!outcome.copied || request.isSettled()) {
              request.finish(new Error('browser_grab_action_copy_failed_effect_unknown'))
              pending.current = null
              return
            }
            operation.outcome = outcome
            update((value) => value + 1)
          },
          () => {
            request.finish(new Error('browser_grab_action_copy_failed_effect_unknown'))
            if (pending.current === operation) {
              pending.current = null
            }
          }
        )
      })
    }
    window.addEventListener(BROWSER_GRAB_ACTION_EVENT, receive)
    return () => {
      mounted.current = false
      window.removeEventListener(BROWSER_GRAB_ACTION_EVENT, receive)
      pending.current?.request.finish(
        new Error('browser_grab_action_ui_unavailable_effect_unknown')
      )
      pending.current = null
    }
  }, [owner.commandOwner?.page])
  return useCallback((key: 'c' | 's'): void => {
    runBrowserGrabActionShortcut({ ...current.current, key })
  }, [])
}
