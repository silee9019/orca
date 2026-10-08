import { useEffect, useRef } from 'react'
import {
  mountEmulatorConnectionsViewerController,
  readEmulatorConnectionsViewerState
} from '@/runtime/emulator-connections-viewer-controller'
export function useEmulatorConnectionsViewerController(actions: {
  surface: 'intro' | 'guide'
  worktreeId?: string
  expanded?: boolean
  keep?: () => void
  hide?: () => void
  dismiss: () => void
  expand?: (open: boolean) => void
  settings?: () => void
}): void {
  const committed = useRef(actions)
  useEffect(() => {
    committed.current = actions
  })
  useEffect(
    () =>
      mountEmulatorConnectionsViewerController({
        surface: actions.surface,
        worktreeId: actions.worktreeId,
        read: () => readEmulatorConnectionsViewerState(committed.current.expanded ?? null),
        keep: () => committed.current.keep?.(),
        hide: () => committed.current.hide?.(),
        dismiss: () => committed.current.dismiss(),
        expand: (open) => committed.current.expand?.(open),
        settings: () => committed.current.settings?.(),
        persisted: async (kind) => {
          const ui = await window.api.ui.get()
          if (kind === 'guide') {
            return ui.mobileEmulatorAgentSetupDismissed === true
          }
          if (kind === 'intro') {
            return ui.mobileEmulatorTabIntroDismissed === true
          }
          const settings = await window.api.settings.get()
          return (
            settings.mobileEmulatorEnabled === false && ui.mobileEmulatorTabIntroDismissed === true
          )
        }
      }),
    [actions.surface, actions.worktreeId]
  )
}
