import {
  BrowserTabDropTarget,
  BrowserTabDragCancelReceipt
} from '../../../shared/rpc-contract/browser-tab-drop-params'

export const BROWSER_TAB_DRAG_CANCEL_EVENT = 'orca:browser-tab-drag-cancel-command'
export type BrowserTabDragCancelEvent = {
  target: BrowserTabDropTarget
  expiresAt: number
  offer: (perform: () => Promise<BrowserTabDragCancelReceipt>, dispose: () => void) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-tab-drag-cancel-command': CustomEvent<BrowserTabDragCancelEvent>
  }
}
export async function requestBrowserTabDragCancel(
  target: BrowserTabDropTarget,
  expiresAt: number
): Promise<BrowserTabDragCancelReceipt> {
  const parsedTarget = BrowserTabDropTarget.parse(target)
  if (Date.now() >= expiresAt) {
    throw new Error('request_expired')
  }
  const offers: { perform: () => Promise<BrowserTabDragCancelReceipt>; dispose: () => void }[] = []
  window.dispatchEvent(
    new CustomEvent(BROWSER_TAB_DRAG_CANCEL_EVENT, {
      detail: {
        target: parsedTarget,
        expiresAt,
        offer: (perform: () => Promise<BrowserTabDragCancelReceipt>, dispose: () => void) =>
          offers.push({ perform, dispose })
      }
    })
  )
  if (offers.length !== 1) {
    offers.forEach((offer) => offer.dispose())
    throw new Error('browser_tab_drag_cancel_owner_not_unique')
  }
  const { perform, dispose } = offers[0]
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(
      () => finish(new Error('browser_tab_drag_cancel_expired_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    function finish(error?: unknown, result?: BrowserTabDragCancelReceipt): void {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      dispose()
      if (error !== undefined) {
        reject(error)
      } else if (Date.now() >= expiresAt) {
        reject(new Error('browser_tab_drag_cancel_expired_effect_unknown'))
      } else {
        const receipt = BrowserTabDragCancelReceipt.safeParse(result)
        if (!receipt.success) {
          reject(new Error('browser_tab_drag_cancel_receipt_invalid_effect_unknown'))
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
