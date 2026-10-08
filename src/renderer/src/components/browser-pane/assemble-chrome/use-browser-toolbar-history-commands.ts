import { useEffect, useRef } from 'react'
import {
  performBrowserNativeShortcutHistory,
  type BrowserNativeHistoryOwner
} from './browser-native-shortcut-history'
import { BROWSER_TOOLBAR_COMMAND_EVENT } from '@/runtime/browser-toolbar-request'
import type { BrowserNavigationControls } from './browser-navigation-control-row'

export function useBrowserToolbarHistoryCommands({
  page,
  controls,
  guestAvailable,
  nativeBack,
  nativeForward,
  shortcutOwner
}: {
  page: string
  controls: BrowserNavigationControls
  guestAvailable: () => boolean
  nativeBack: boolean
  nativeForward: boolean
  shortcutOwner?: BrowserNativeHistoryOwner
}): void {
  const busy = useRef(false)
  useEffect(() => {
    let mounted = true
    const receive = (event: WindowEventMap['orca:browser-toolbar-command']): void => {
      const request = event.detail
      if (
        request.page !== page ||
        !['back', 'forward', 'back-shortcut', 'forward-shortcut'].includes(request.action) ||
        !request.claim()
      ) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (request.action === 'back-shortcut' || request.action === 'forward-shortcut') {
        if (busy.current) {
          request.finish(new Error('browser_shortcut_history_busy'))
          return
        }
        busy.current = true
        try {
          performBrowserNativeShortcutHistory(request, shortcutOwner, () => mounted)
        } catch (error) {
          request.finish(
            error instanceof Error ? error : new Error('browser_shortcut_history_failed')
          )
        } finally {
          busy.current = false
        }
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
    return () => {
      mounted = false
      window.removeEventListener(BROWSER_TOOLBAR_COMMAND_EVENT, receive)
    }
  }, [page, controls, guestAvailable, nativeBack, nativeForward, shortcutOwner])
}
