import { useEffect, useRef } from 'react'
import type { BrowserPaletteSelection } from '../../../shared/rpc-contract/browser-palette-params'
import type { BrowserPagePaletteActivationResult } from '../lib/browser-page-palette-activation'
import { BrowserPaletteCommandEvent } from '../runtime/browser-palette-command'
export function useBrowserPaletteCommand(
  select: (target: BrowserPaletteSelection) => BrowserPagePaletteActivationResult
): void {
  const latest = useRef(select)
  useEffect(() => {
    latest.current = select
  }, [select])
  useEffect(() => {
    let active = true
    const listener = (event: Event) => {
      if (!(event instanceof BrowserPaletteCommandEvent)) {
        return
      }
      event.offers.push(() => {
        if (!active || Date.now() >= event.expiresAt) {
          throw new Error('browser_palette_request_expired')
        }
        return latest.current(event.selection)
      })
    }
    window.addEventListener('orca:browser-palette-select', listener)
    return () => {
      active = false
      window.removeEventListener('orca:browser-palette-select', listener)
    }
  }, [])
}
