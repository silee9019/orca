import type { RefObject } from 'react'
import type { BrowserContextMenuState } from '../../../../../shared/rpc-contract/browser-context-menu-params'
import type { BrowserPageContextMenuState } from '../describe-page/browser-page-types'
type BrowserContextMenuSnapshotOwner = {
  menu: BrowserPageContextMenuState | null
  ref: RefObject<HTMLDivElement | null>
}
export function browserContextMenuButtons(
  owner: BrowserContextMenuSnapshotOwner
): HTMLButtonElement[] {
  return [
    ...(owner.ref.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)'
    ) ?? [])
  ]
}
export function snapshotBrowserContextMenu(
  owner: BrowserContextMenuSnapshotOwner
): BrowserContextMenuState {
  const index =
    document.activeElement instanceof HTMLButtonElement
      ? browserContextMenuButtons(owner).indexOf(document.activeElement)
      : -1
  return {
    open: owner.menu !== null,
    focusedItem: index === -1 ? null : index,
    hasLink: Boolean(owner.menu?.linkUrl),
    hasSelection: Boolean(owner.menu?.selectionText.trim())
  }
}
