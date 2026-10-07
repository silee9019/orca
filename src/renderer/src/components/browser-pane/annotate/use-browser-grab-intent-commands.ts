import { useEffect } from 'react'
import { BROWSER_GRAB_COMMAND_EVENT } from '@/runtime/browser-grab-request'
import type { GrabModeHook } from './useGrabMode'
import type { GrabIntent } from '../../../../../shared/browser-grab-types'
export function useBrowserGrabIntentCommands(
  page: string,
  isActive: boolean,
  grab: GrabModeHook,
  start: (intent: GrabIntent) => void
): void {
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-grab-command']): void => {
      const request = event.detail
      if (request.page !== page || request.action !== 'intent-start' || !request.claim()) {
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
      if (grab.state !== 'idle' && grab.state !== 'error') {
        request.finish(new Error('browser_grab_already_active'))
        return
      }
      if (request.intent !== 'copy' && request.intent !== 'annotate') {
        request.finish(new Error('invalid_grab_intent'))
        return
      }
      try {
        start(request.intent)
        request.finish(undefined, {
          state: grab.state,
          hasSelection: grab.payload !== null,
          hasScreenshot: Boolean(grab.payload?.screenshot),
          contextMenu: grab.contextMenu
        })
      } catch {
        request.finish(new Error('browser_grab_start_failed'))
      }
    }
    window.addEventListener(BROWSER_GRAB_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_GRAB_COMMAND_EVENT, receive)
  }, [page, isActive, grab, start])
}
