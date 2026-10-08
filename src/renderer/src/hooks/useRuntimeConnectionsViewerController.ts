import { useEffect, useRef } from 'react'
import {
  mountRuntimeConnectionsViewerController,
  type RuntimeConnectionsViewerController
} from '@/runtime/runtime-connections-viewer-controller'
export function useRuntimeConnectionsViewerController(
  controller: RuntimeConnectionsViewerController
): void {
  const committed = useRef(controller)
  const profileAvailable = controller.profile !== undefined
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      mountRuntimeConnectionsViewerController({
        read: () => committed.current.read(),
        profile: profileAvailable
          ? {
              select: async (id) => {
                if (!committed.current.profile) {
                  throw new Error('profile_selection_unavailable')
                }
                return committed.current.profile.select(id)
              },
              persisted: async (id) => committed.current.profile?.persisted(id) ?? false,
              request: (id) => committed.current.profile?.request(id),
              confirm: async () => committed.current.profile?.confirm() ?? false,
              cancel: () => committed.current.profile?.cancel()
            }
          : undefined,
        matchesPairingCode: (value) => committed.current.matchesPairingCode(value),
        hasEnvironment: (id) => committed.current.hasEnvironment(id),
        useEnvironment: (id) => committed.current.useEnvironment(id),
        setWorkflow: (value) => committed.current.setWorkflow(value),
        setAddFormOpen: (value) => committed.current.setAddFormOpen(value),
        setShareFormOpen: (value) => committed.current.setShareFormOpen(value),
        setAdvancedOpen: (value) => committed.current.setAdvancedOpen(value),
        setName: (value) => committed.current.setName(value),
        setPairingCode: (value) => committed.current.setPairingCode(value),
        cancelAdd: () => committed.current.cancelAdd()
      }),
    [profileAvailable]
  )
}
