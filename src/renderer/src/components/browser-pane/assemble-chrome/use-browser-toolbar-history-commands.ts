import { useEffect } from 'react'
import { BROWSER_TOOLBAR_COMMAND_EVENT } from '@/runtime/browser-toolbar-request'
import type { BrowserNavigationControls } from './browser-navigation-control-row'

export function useBrowserToolbarHistoryCommands({
  page,
  controls,
  guestAvailable,
  nativeBack,
  nativeForward
}: {
  page: string
  controls: BrowserNavigationControls
  guestAvailable: () => boolean
  nativeBack: boolean
  nativeForward: boolean
}): void {
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-toolbar-command']): void => {
      const request = event.detail
      if (
        request.page !== page ||
        (request.action !== 'back' && request.action !== 'forward') ||
        !request.claim()
      ) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      const back = request.action === 'back'
      if (!(back ? controls.canGoBack : controls.canGoForward)) {
        request.finish(new Error('browser_history_unavailable'))
        return
      }
      if ((back ? nativeBack : nativeForward) && !guestAvailable()) {
        request.finish(new Error('browser_guest_unavailable'))
        return
      }
      try {
        if (back) {
          controls.goBack()
        } else {
          controls.goForward()
        }
        request.finish(undefined, { action: request.action })
      } catch {
        request.finish(new Error('browser_toolbar_action_failed'))
      }
    }
    window.addEventListener(BROWSER_TOOLBAR_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_TOOLBAR_COMMAND_EVENT, receive)
  }, [page, controls, guestAvailable, nativeBack, nativeForward])
}
