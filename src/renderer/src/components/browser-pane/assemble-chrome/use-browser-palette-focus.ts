import { useEffect, useRef } from 'react'
import { BrowserPaletteFocusEvent } from '@/runtime/browser-palette-focus-request'
export function useBrowserPaletteFocus(
  page: string,
  isActive: boolean,
  focusAddress: () => boolean,
  focusGuest: () => boolean,
  cancelAddressGrab: () => void
): void {
  const latest = useRef({ page, isActive, focusAddress, focusGuest, cancelAddressGrab })
  useEffect(() => {
    latest.current = { page, isActive, focusAddress, focusGuest, cancelAddressGrab }
  }, [page, isActive, focusAddress, focusGuest, cancelAddressGrab])
  useEffect(() => {
    let active = true
    const listener = (event: Event) => {
      if (
        !(event instanceof BrowserPaletteFocusEvent) ||
        event.page !== latest.current.page ||
        !latest.current.isActive
      ) {
        return
      }
      event.offers.push(() => {
        const owner = latest.current
        if (
          !active ||
          !owner.isActive ||
          owner.page !== event.page ||
          Date.now() >= event.expiresAt
        ) {
          return false
        }
        if (event.focusTarget === 'address-bar') {
          return owner.focusAddress()
        }
        owner.cancelAddressGrab()
        return owner.focusGuest()
      })
    }
    window.addEventListener('orca:browser-palette-focus', listener)
    return () => {
      active = false
      window.removeEventListener('orca:browser-palette-focus', listener)
    }
  }, [])
}
