import type { WorkspaceListViewerSnapshot } from '../../../shared/workspace-list-viewer-command'

export type WorkspaceListCollapseControl = { toggle: (groupKey: string) => void }

let committed: WorkspaceListViewerSnapshot | null = null
let collapseControl: WorkspaceListCollapseControl | null = null
export function publishWorkspaceListViewerView(view: WorkspaceListViewerSnapshot | null): void {
  committed = view
}
// Why: the original list's toggle also records the scroll anchor, so the CLI reuses it as published.
export function publishWorkspaceListCollapseControl(
  control: WorkspaceListCollapseControl | null
): void {
  collapseControl = control
}
function readMeasuredList(): HTMLElement | null {
  const node = document.querySelector<HTMLElement>('[data-worktree-sidebar-container]')
  if (!node) {
    return null
  }
  const bounds = node.getBoundingClientRect()
  const sidebar = node.closest<HTMLElement>('[data-viewer-sidebar="left"]')
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    (sidebar && sidebar.getBoundingClientRect().width <= 0)
  ) {
    return null
  }
  return node
}
export function readWorkspaceListViewerView(): WorkspaceListViewerSnapshot | null {
  const node = readMeasuredList()
  if (!node || !committed) {
    return null
  }
  const empty = node.hasAttribute('data-workspace-list-empty')
  return { ...committed, empty, rows: empty ? [] : committed.rows }
}
export function readWorkspaceListCollapseControl(): WorkspaceListCollapseControl | null {
  return readMeasuredList() ? collapseControl : null
}
