export class BrowserPaletteFocusEvent extends Event {
  readonly offers: (() => boolean)[] = []
  constructor(
    readonly page: string,
    readonly focusTarget: 'address-bar' | 'webview',
    readonly expiresAt: number
  ) {
    super('orca:browser-palette-focus')
  }
}
export function requestBrowserPaletteFocus(
  page: string,
  target: 'address-bar' | 'webview',
  expiresAt: number
): void {
  const event = new BrowserPaletteFocusEvent(page, target, expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1 || !event.offers[0]()) {
    throw new Error('browser_palette_focus_not_applied')
  }
}
