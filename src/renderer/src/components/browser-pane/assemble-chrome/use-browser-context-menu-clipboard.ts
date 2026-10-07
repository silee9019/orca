import { useCallback } from 'react'
import { writeVerifiedClipboardText } from '@/runtime/clipboard-text-write'
import type { BrowserPageContextMenuState } from '../describe-page/browser-page-types'
export type BrowserContextClipboardSource = 'link' | 'page' | 'selection'
export function useBrowserContextMenuClipboard(
  menu: BrowserPageContextMenuState | null,
  close: () => void
): (source: BrowserContextClipboardSource, verified?: boolean) => void | Promise<boolean> {
  return useCallback(
    (source, verified = false) => {
      const text =
        source === 'link'
          ? (menu?.linkUrl ?? '')
          : source === 'page'
            ? (menu?.pageUrl ?? '')
            : (menu?.selectionText ?? '')
      if (!verified) {
        void window.api.ui.writeClipboardText(text)
        close()
        return
      }
      const completion = writeVerifiedClipboardText(text)
      close()
      return completion
    },
    [menu, close]
  )
}
