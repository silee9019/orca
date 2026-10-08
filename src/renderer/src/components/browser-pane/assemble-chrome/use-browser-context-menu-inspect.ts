import { useCallback } from 'react'
export function useBrowserContextMenuInspect(
  browserPageId: string,
  close: () => void
): (verified?: boolean) => Promise<boolean> {
  return useCallback(
    async (verified = false) => {
      const completion = window.api.browser.openDevTools({ browserPageId })
      close()
      const accepted = await completion
      if (verified && accepted !== true) {
        throw new Error('browser_context_menu_inspect_unavailable')
      }
      return accepted
    },
    [browserPageId, close]
  )
}
