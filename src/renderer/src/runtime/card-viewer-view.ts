import type { CardViewerSnapshot } from '../../../shared/card-viewer-command'

export function readCardViewerView(): CardViewerSnapshot[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-worktree-card-viewer-id]'))
    .filter((node) => {
      const sidebar = node.closest<HTMLElement>('[data-viewer-sidebar="left"]')
      const bounds = node.getBoundingClientRect()
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        (!sidebar || sidebar.getBoundingClientRect().width > 0)
      )
    })
    .map((node) => ({
      id: node.dataset.worktreeCardViewerId ?? '',
      repoId: node.dataset.worktreeCardViewerRepo ?? '',
      hostId: node.dataset.worktreeCardViewerHost || null,
      compact: node.dataset.worktreeCardCompact === 'true',
      newStyle: node.dataset.worktreeCardNewStyle === 'true',
      properties: node.dataset.worktreeCardProperties?.split(',').filter(Boolean) ?? [],
      activityMode: node.dataset.worktreeCardActivity ?? '',
      runtimeContextKey: node.dataset.worktreeCardRuntime ?? ''
    }))
}
