import { useLayoutEffect } from 'react'

type DialogKind = 'install' | 'management' | 'share' | 'detail' | 'freshness'
type DialogControl = { busy: boolean; close: () => void }
const mountedDialogs = new Map<DialogKind, Set<DialogControl>>()
export function useSkillsViewerDialog(
  kind: DialogKind,
  open: boolean,
  busy: boolean,
  close: () => void
): void {
  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const control = { busy, close }
    const controls = mountedDialogs.get(kind) ?? new Set<DialogControl>()
    controls.add(control)
    mountedDialogs.set(kind, controls)
    return () => {
      controls.delete(control)
      if (!controls.size) {
        mountedDialogs.delete(kind)
      }
    }
  }, [kind, open, busy, close])
}
export function dialogClose(kind: DialogKind): () => void {
  const controls = mountedDialogs.get(kind)
  if (controls?.size !== 1) {
    throw new Error(controls?.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = controls.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  if (control.busy) {
    throw new Error('viewer_busy')
  }
  return control.close
}

export function isSkillsViewerDialogOpen(kind: DialogKind): boolean {
  return mountedDialogs.has(kind)
}
