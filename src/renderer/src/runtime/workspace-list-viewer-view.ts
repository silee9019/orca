import type { WorkspaceListViewerSnapshot } from '../../../shared/workspace-list-viewer-command'

let committed: WorkspaceListViewerSnapshot | null = null
export function publishWorkspaceListViewerView(view: WorkspaceListViewerSnapshot | null): void {
  committed = view
}
export function readWorkspaceListViewerView(): WorkspaceListViewerSnapshot | null {
  const node = document.querySelector<HTMLElement>('[data-worktree-sidebar-container]')
  if (!node || !committed) {
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
  const empty = node.hasAttribute('data-workspace-list-empty')
  return { ...committed, empty, rows: empty ? [] : committed.rows }
}
