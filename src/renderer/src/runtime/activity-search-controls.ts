import type { ActivityViewerSurface } from '../../../shared/rpc-contract/activity-viewer-params'

export type ActivitySearchControl = {
  getInput: () => HTMLInputElement | null
  getQuery: () => string
  setQuery: (query: string) => void
  setShowSearch?: (visible: boolean) => Promise<void>
}
const controls: Record<ActivityViewerSurface, Set<ActivitySearchControl>> = {
  'activity-page': new Set(),
  'sidebar-agents': new Set()
}
export function publishActivitySearchControl(
  surface: ActivityViewerSurface,
  control: ActivitySearchControl
): () => void {
  controls[surface].add(control)
  return () => {
    controls[surface].delete(control)
  }
}
export function captureActivitySearchControl(
  surface: ActivityViewerSurface
): ActivitySearchControl {
  const mounted = controls[surface]
  if (mounted.size === 0) {
    throw new Error('activity_surface_unavailable')
  }
  if (mounted.size !== 1) {
    throw new Error('activity_surface_ambiguous')
  }
  const control = [...mounted][0]
  if (!control) {
    throw new Error('activity_surface_unavailable')
  }
  return control
}
