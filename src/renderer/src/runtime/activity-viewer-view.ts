import type { ActivityViewerSurface } from '../../../shared/rpc-contract/activity-viewer-params'
import type { ActivityViewerSnapshot } from '../../../shared/activity-viewer-command'

const committed: Partial<
  Record<ActivityViewerSurface, { view: ActivityViewerSnapshot; markAllRead?: () => void }>
> = {}
export function publishActivityViewerView(
  surface: ActivityViewerSurface,
  view: ActivityViewerSnapshot | null,
  markAllRead?: () => void
): void {
  if (view) {
    committed[surface] = { view, markAllRead }
  } else {
    delete committed[surface]
  }
}
export function readActivityViewerView(
  surface: ActivityViewerSurface
): ActivityViewerSnapshot | null {
  const view = committed[surface]?.view
  const root = document.querySelector<HTMLElement>(`[data-activity-viewer="${surface}"]`)
  if (!view || !root) {
    return null
  }
  const bounds = root.getBoundingClientRect()
  const sidebar = root.closest<HTMLElement>('[data-viewer-sidebar="left"]')
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    (sidebar && sidebar.getBoundingClientRect().width <= 0)
  ) {
    return null
  }
  const keys = new Set(
    view.logicalRows.filter((row) => row.kind === 'thread').map((row) => row.key)
  )
  const renderedRows = [
    ...root.querySelectorAll<HTMLElement>('[data-activity-viewer-thread]')
  ].flatMap((row) => {
    const key = row.getAttribute('data-activity-viewer-thread')
    const height = row.getBoundingClientRect().height
    return key && keys.has(key) && Number.isFinite(height) && height > 0 ? [{ key, height }] : []
  })
  return {
    ...view,
    densityMeasured: root.getAttribute('data-activity-density-measured') === String(view.compact),
    renderedRows
  }
}

export function readActivityMarkAllReadControl(surface: ActivityViewerSurface): {
  markAllRead: () => void
  hasUnreadThreads: boolean
} | null {
  const entry = committed[surface]
  return entry?.markAllRead && typeof entry.view.hasUnreadThreads === 'boolean'
    ? { markAllRead: entry.markAllRead, hasUnreadThreads: entry.view.hasUnreadThreads }
    : null
}
