export type ActivityPreviewIssueCopyControl = {
  url: string
  copy: () => Promise<boolean>
}
type IssueCopyLease = ActivityPreviewIssueCopyControl & {
  active: boolean
  isCurrent: () => boolean
}
const controls = new WeakMap<HTMLElement, Set<IssueCopyLease>>()
export function publishActivityPreviewIssueCopyControl(
  portal: HTMLElement,
  control: ActivityPreviewIssueCopyControl
): () => void {
  const entries = controls.get(portal) ?? new Set<IssueCopyLease>()
  for (const entry of entries) {
    entry.active = false
  }
  const lease: IssueCopyLease = {
    url: control.url,
    copy: control.copy,
    active: entries.size === 0,
    isCurrent: () => lease.active && entries.size === 1 && entries.has(lease)
  }
  entries.add(lease)
  controls.set(portal, entries)
  return () => {
    lease.active = false
    entries.delete(lease)
    if (entries.size === 0 && controls.get(portal) === entries) {
      controls.delete(portal)
    }
  }
}
export function readActivityPreviewIssueCopyControl(portal: HTMLElement) {
  const entries = controls.get(portal)
  const lease = entries?.size === 1 ? entries.values().next().value : undefined
  return lease?.isCurrent() ? lease : null
}
