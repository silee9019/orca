import { useEffect } from 'react'
import { BROWSER_CHROME_ADDRESS_FOCUS_EVENT } from '@/runtime/browser-chrome-focus-request'
export function useBrowserChromeFocusCommands(
  page: string,
  active: boolean,
  focus: () => boolean
): void {
  useEffect(() => {
    if (!active) {
      return
    }
    const receive = (event: WindowEventMap['orca:browser-chrome-address-focus']): void => {
      const request = event.detail
      if (request.page !== page || !request.claim()) {
        return
      }
      try {
        request.finish(focus())
      } catch {
        request.finish(false)
      }
    }
    window.addEventListener(BROWSER_CHROME_ADDRESS_FOCUS_EVENT, receive)
    return () => window.removeEventListener(BROWSER_CHROME_ADDRESS_FOCUS_EVENT, receive)
  }, [page, active, focus])
}
