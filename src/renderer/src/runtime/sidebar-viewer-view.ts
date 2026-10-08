import type { SidebarViewerSnapshot } from '../../../shared/sidebar-viewer-command'
export function readSidebarViewerView(): SidebarViewerSnapshot {
  const left = document.querySelector<HTMLElement>('[data-viewer-sidebar="left"]')
  const right = document.querySelector<HTMLElement>('[data-viewer-sidebar="right"]')
  const panel = right?.querySelector<HTMLElement>('[data-rendered-sidebar-panel]')
  const explorer = panel?.querySelector<HTMLElement>('[data-file-explorer-view]')
  const view = explorer?.dataset.fileExplorerView
  return {
    leftMounted: left !== null,
    leftVisible: (left?.getBoundingClientRect().width ?? 0) > 0,
    rightMounted: right !== null,
    rightVisible: (right?.getBoundingClientRect().width ?? 0) > 0,
    panel: panel?.dataset.renderedSidebarPanel ?? null,
    explorerView: view === 'files' || view === 'search' ? view : null,
    panelReady: Array.from(panel?.children ?? []).some((node) => node.getClientRects().length > 0),
    availablePanels: right?.dataset.availableSidebarPanels?.split(',').filter(Boolean) ?? []
  }
}
export async function waitForSidebarViewerView(
  matches: (view: SidebarViewerSnapshot) => boolean,
  expiresAt: number
): Promise<boolean> {
  const deadline = Math.min(expiresAt - 100, Date.now() + 5000)
  do {
    if (matches(readSidebarViewerView())) {
      return true
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  } while (Date.now() < deadline)
  return false
}
