export type BrowserChromeFocusRequest = {
  page: string
  claim: () => boolean
  finish: (focused: boolean) => void
}
export const BROWSER_CHROME_ADDRESS_FOCUS_EVENT = 'orca:browser-chrome-address-focus'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-chrome-address-focus': CustomEvent<BrowserChromeFocusRequest>
  }
}
export function requestBrowserChromeAddressFocus(page: string): boolean | 'unavailable' {
  let claimed = false
  let finished = false
  let result: boolean | 'unavailable' = 'unavailable'
  window.dispatchEvent(
    new CustomEvent(BROWSER_CHROME_ADDRESS_FOCUS_EVENT, {
      detail: {
        page,
        claim: () => {
          if (claimed) {
            return false
          }
          claimed = true
          return true
        },
        finish: (focused: boolean) => {
          if (!claimed || finished) {
            return
          }
          finished = true
          result = focused
        }
      }
    })
  )
  return result
}
