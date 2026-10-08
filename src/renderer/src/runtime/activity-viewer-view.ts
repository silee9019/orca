import type { ActivityViewerSurface } from '../../../shared/rpc-contract/activity-viewer-params'
import type { ActivityViewerSnapshot } from '../../../shared/activity-viewer-command'

const committed: Partial<Record<ActivityViewerSurface, ActivityViewerSnapshot>> = {}
export function publishActivityViewerView(
  surface: ActivityViewerSurface,
  view: ActivityViewerSnapshot | null
): void {
  if (view) {committed[surface] = view}
  else {delete committed[surface]}
}
export function readActivityViewerView(
  surface: ActivityViewerSurface
): ActivityViewerSnapshot | null {
  const view = committed[surface]
  const root = document.querySelector<HTMLElement>(`[data-activity-viewer="${surface}"]`)
  if (!view || !root) {return null}
  const bounds = root.getBoundingClientRect()
  const sidebar = root.closest<HTMLElement>('[data-viewer-sidebar="left"]')
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    (sidebar && sidebar.getBoundingClientRect().width <= 0)
  )
    {return null}
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
