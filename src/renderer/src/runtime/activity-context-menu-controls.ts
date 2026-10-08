type ContextMenuControl = {
  active: boolean
  close: () => void
  isCurrent: () => boolean
}
const controls = new WeakMap<HTMLElement, Set<ContextMenuControl>>()
export function publishActivityContextMenuControl(menu: HTMLElement, close: () => void) {
  const entries = controls.get(menu) ?? new Set<ContextMenuControl>()
  for (const entry of entries) {
    entry.active = false
  }
  const control = {
    active: entries.size === 0,
    close,
    isCurrent: () => control.active && entries.size === 1 && entries.has(control)
  }
  entries.add(control)
  controls.set(menu, entries)
  return () => {
    control.active = false
    entries.delete(control)
    if (!entries.size && controls.get(menu) === entries) {
      controls.delete(menu)
    }
  }
}
export function readActivityContextMenuControl(menu: HTMLElement) {
  const entries = controls.get(menu)
  const control = entries?.size === 1 ? entries.values().next().value : undefined
  return control?.isCurrent() ? control : null
}
