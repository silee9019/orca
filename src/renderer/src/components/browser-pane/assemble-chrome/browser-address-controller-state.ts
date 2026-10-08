import { redactKagiSessionToken } from '../../../../../shared/browser-url'
import type { BrowserAddressState } from '../../../../../shared/rpc-contract/browser-address-params'
import type { BrowserAddressController } from './use-browser-address-commands'
export function snapshotBrowserAddressController(
  controller: BrowserAddressController
): BrowserAddressState {
  return {
    value: redactKagiSessionToken(controller.value),
    open: controller.open,
    focused:
      controller.inputRef.current !== null &&
      document.activeElement === controller.inputRef.current,
    selectedIndex: controller.suggestions.findIndex((row) => row.url === controller.selectedValue),
    suggestions: controller.suggestions.map((row, index) => ({
      index,
      url: redactKagiSessionToken(row.url),
      title: row.title,
      kind: row.docLocation ? 'workspace-doc' : row.isSearch ? 'search' : 'history'
    }))
  }
}
