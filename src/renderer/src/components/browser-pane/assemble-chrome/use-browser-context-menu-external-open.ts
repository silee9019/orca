import { useCallback } from 'react'
import { normalizeExternalBrowserUrl } from '../../../../../shared/browser-url'
import { openBrowserTabExternallyVerified } from '../../tab-bar/browser-tab-external-open'
import type { BrowserPageContextMenuState } from '../describe-page/browser-page-types'
export function useBrowserContextMenuExternalOpen(
  menu: BrowserPageContextMenuState | null,
  close: () => void
): (source: 'link' | 'page', verified?: boolean) => void | Promise<void> {
  return useCallback(
    (source, verified = false) => {
      const target = normalizeExternalBrowserUrl(
        source === 'link' ? (menu?.linkUrl ?? '') : (menu?.pageUrl ?? '')
      )
      if (!verified) {
        if (target) {
          void window.api.shell.openUrl(target)
        }
        close()
        return
      }
      return (async () => {
        try {
          if (!target) {
            throw new Error('browser_context_menu_external_target_unavailable')
          }
          await openBrowserTabExternallyVerified(window.api.shell, target)
        } finally {
          close()
        }
      })()
    },
    [menu, close]
  )
}
