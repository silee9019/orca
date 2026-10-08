import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react'
import { normalizeBrowserNavigationUrl } from '../../../../../shared/browser-url'
import { BROWSER_TOOLBAR_COMMAND_EVENT } from '@/runtime/browser-toolbar-request'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import type { BrowserPage as BrowserPageState } from '../../../../../shared/browser-workspace-types'
import {
  type BrowserReloadTrigger,
  reloadBrowserPageWebview,
  resolveBrowserReloadButtonLabelKind,
  resolveBrowserReloadIntent
} from './browser-reload-action'
import { retryBrowserTabLoad } from '../describe-page/browser-page-url-display'
import type { BrowserTabPageState } from '../describe-page/browser-page-types'

export function useBrowserPageReloadActions({
  browserTab,
  webviewRef,
  trackNextLoadingEventRef,
  retryGuestRecoveryRef,
  onUpdatePageStateRef
}: {
  browserTab: BrowserPageState
  webviewRef: MutableRefObject<Electron.WebviewTag | null>
  trackNextLoadingEventRef?: MutableRefObject<boolean>
  retryGuestRecoveryRef: MutableRefObject<() => void>
  onUpdatePageStateRef: MutableRefObject<(tabId: string, updates: BrowserTabPageState) => void>
}): {
  reloadWebviewOrRecoverGuest: (ignoreCache: boolean) => boolean
  runReloadTrigger: (trigger: BrowserReloadTrigger) => void
  reloadButtonLabel: string
  reloadButtonLabelKind: ReturnType<typeof resolveBrowserReloadButtonLabelKind>
  reloadMenuOpen: boolean
  setReloadMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
  reloadShortcut: string
  hardReloadShortcut: string
} {
  const reloadShortcut = useShortcutLabel('browser.reload')
  const hardReloadShortcut = useShortcutLabel('browser.hardReload')
  const [reloadMenuOpen, setReloadMenuOpen] = useState(false)
  const reloadState = useMemo(
    () => ({ loading: browserTab.loading, loadErrorCode: browserTab.loadError?.code ?? null }),
    [browserTab.loading, browserTab.loadError]
  )
  const reloadWebviewOrRecoverGuest = useCallback(
    (ignoreCache: boolean) => {
      const webview = webviewRef.current
      if (!webview) {
        return false
      }
      if (trackNextLoadingEventRef) {
        trackNextLoadingEventRef.current = true
      }
      const result = reloadBrowserPageWebview(webview, { ignoreCache })
      if (result === 'reloaded') {
        onUpdatePageStateRef.current(browserTab.id, { loading: true })
        return true
      } else if (result === 'guest-missing') {
        if (trackNextLoadingEventRef) {
          trackNextLoadingEventRef.current = false
        }
        // Why: reload cannot revive a destroyed guest (STA-3448) — recreate it instead.
        onUpdatePageStateRef.current(browserTab.id, { loading: true })
        retryGuestRecoveryRef.current()
        return true
      } else if (trackNextLoadingEventRef) {
        trackNextLoadingEventRef.current = false
      }
      return false
    },
    [
      browserTab.id,
      onUpdatePageStateRef,
      retryGuestRecoveryRef,
      trackNextLoadingEventRef,
      webviewRef
    ]
  )
  const runReloadTrigger = useCallback(
    (trigger: BrowserReloadTrigger) => {
      const webview = webviewRef.current
      if (!webview) {
        return null
      }
      const intent = resolveBrowserReloadIntent(trigger, reloadState)
      let accepted = true
      switch (intent) {
        case 'stop':
          webview.stop()
          break
        case 'retry-guest-recovery':
          onUpdatePageStateRef.current(browserTab.id, { loading: true })
          retryGuestRecoveryRef.current()
          break
        case 'retry-load':
          accepted = Boolean(
            normalizeBrowserNavigationUrl(browserTab.loadError?.validatedUrl ?? browserTab.url)
          )
          retryBrowserTabLoad(webview, browserTab, onUpdatePageStateRef.current)
          break
        case 'hard-reload':
          accepted = reloadWebviewOrRecoverGuest(true)
          break
        case 'reload':
          accepted = reloadWebviewOrRecoverGuest(false)
          break
      }
      return accepted ? intent : null
    },
    [
      browserTab,
      onUpdatePageStateRef,
      reloadState,
      reloadWebviewOrRecoverGuest,
      retryGuestRecoveryRef,
      webviewRef
    ]
  )

  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-toolbar-command']): void => {
      const request = event.detail
      if (
        request.page !== browserTab.id ||
        request.action === 'back' ||
        request.action === 'forward' ||
        request.action === 'back-shortcut' ||
        request.action === 'forward-shortcut' ||
        !request.claim()
      ) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      try {
        const intent = runReloadTrigger(
          request.action === 'reload-button' ? 'button' : request.action
        )
        if (!intent) {
          request.finish(new Error('browser_guest_not_ready'))
        } else {
          request.finish(undefined, { action: request.action, intent })
        }
      } catch {
        request.finish(new Error('browser_toolbar_action_failed'))
      }
    }
    window.addEventListener(BROWSER_TOOLBAR_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_TOOLBAR_COMMAND_EVENT, receive)
  }, [browserTab.id, runReloadTrigger])

  // Keep the accessible name honest: the same button is Stop mid-load and Retry after a failure.
  const reloadButtonLabelKind = resolveBrowserReloadButtonLabelKind(reloadState)
  const reloadButtonLabel =
    reloadButtonLabelKind === 'stop'
      ? translate('auto.components.browser.pane.BrowserPane.b7e4d9c1a2', 'Stop')
      : reloadButtonLabelKind === 'retry'
        ? translate('auto.components.browser.pane.BrowserPane.781d6459ad', 'Retry')
        : translate('auto.components.browser.pane.BrowserPane.0e080d820e', 'Reload')

  return {
    reloadWebviewOrRecoverGuest,
    runReloadTrigger,
    reloadButtonLabel,
    reloadButtonLabelKind,
    reloadMenuOpen,
    setReloadMenuOpen,
    reloadShortcut,
    hardReloadShortcut
  }
}
