import { useEffect, useRef } from 'react'
import {
  mountStatusBarConnectionsViewerController,
  type StatusBarConnectionsViewerController
} from '@/runtime/status-bar-connections-viewer-controller'
export function useStatusBarConnectionsViewerController(
  owner: StatusBarConnectionsViewerController,
  enabled = true
): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(
    () =>
      enabled
        ? mountStatusBarConnectionsViewerController({
            surface: owner.surface,
            read: (id) => committed.current.read(id),
            disclosure: (open) => committed.current.disclosure?.(open) ?? Promise.resolve(false),
            manage: () => committed.current.manage?.() ?? false,
            connect: (id) => committed.current.connect?.(id) ?? Promise.resolve(false),
            disconnect: (id) => committed.current.disconnect?.(id) ?? Promise.resolve(false),
            setVisible: (value) => committed.current.setVisible?.(value) ?? false,
            persisted: (value) => committed.current.persisted?.(value) ?? Promise.resolve(false)
          })
        : undefined,
    [enabled, owner.surface]
  )
}
