import {
  BrowserTabDropTarget,
  BrowserTabDropDestination,
  BrowserTabDropReceipt
} from '../../../shared/rpc-contract/browser-tab-drop-params'

export const BROWSER_TAB_DROP_EVENT = 'orca:browser-tab-drop-command'
export type BrowserTabDropEvent = {
  target: BrowserTabDropTarget
  destination: BrowserTabDropDestination
  expiresAt: number
  offer: (perform: () => Promise<BrowserTabDropReceipt>, dispose: () => void) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-tab-drop-command': CustomEvent<BrowserTabDropEvent>
  }
}
export async function requestBrowserTabDrop(
  target: BrowserTabDropTarget,
  destination: BrowserTabDropDestination,
  expiresAt: number
): Promise<BrowserTabDropReceipt> {
  const parsedTarget = BrowserTabDropTarget.parse(target)
  const parsedDestination = BrowserTabDropDestination.parse(destination)
  if (Date.now() >= expiresAt) {
    throw new Error('request_expired')
  }
  const offers: { perform: () => Promise<BrowserTabDropReceipt>; dispose: () => void }[] = []
  window.dispatchEvent(
    new CustomEvent(BROWSER_TAB_DROP_EVENT, {
      detail: {
        target: parsedTarget,
        destination: parsedDestination,
        expiresAt,
        offer: (perform: () => Promise<BrowserTabDropReceipt>, dispose: () => void) =>
          offers.push({ perform, dispose })
      }
    })
  )
  if (offers.length !== 1) {
    offers.forEach((offer) => offer.dispose())
    throw new Error('browser_tab_drop_owner_not_unique')
  }
  const { perform, dispose } = offers[0]
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(
      () => finish(new Error('browser_tab_drop_expired_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    function finish(error?: unknown, result?: BrowserTabDropReceipt): void {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      dispose()
      if (error !== undefined) {
        reject(error)
      } else if (Date.now() >= expiresAt) {
        reject(new Error('browser_tab_drop_expired_effect_unknown'))
      } else {
        const receipt = BrowserTabDropReceipt.safeParse(result)
        if (!receipt.success) {
          reject(new Error('browser_tab_drop_receipt_invalid_effect_unknown'))
        } else {
          resolve(receipt.data)
        }
      }
    }
    void perform().then(
      (result) => finish(undefined, result),
      (error) => finish(error)
    )
  })
}
