import type { BrowserPaletteSelection } from '../../../shared/rpc-contract/browser-palette-params'
import type { BrowserPagePaletteActivationResult } from '../lib/browser-page-palette-activation'
export class BrowserPaletteCommandEvent extends Event {
  readonly offers: (() => BrowserPagePaletteActivationResult)[] = []
  constructor(
    readonly selection: BrowserPaletteSelection,
    readonly expiresAt: number
  ) {
    super('orca:browser-palette-select')
  }
}
export function dispatchBrowserPaletteSelection(
  target: BrowserPaletteSelection,
  expiresAt: number
) {
  const event = new BrowserPaletteCommandEvent(target, expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length ? 'browser_palette_ambiguous' : 'browser_palette_unavailable'
    )
  }
  const result = event.offers[0]()
  if (result.status !== 'activated') {
    throw new Error(`browser_palette_${result.reason}`)
  }
  return result
}
