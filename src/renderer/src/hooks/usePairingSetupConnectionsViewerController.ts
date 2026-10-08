import { useEffect, useRef } from 'react'
import {
  mountPairingSetupConnectionsViewerController,
  type PairingSetupConnectionsViewerController
} from '@/runtime/pairing-setup-connections-viewer-controller'
export function usePairingSetupConnectionsViewerController(
  controller: PairingSetupConnectionsViewerController
): void {
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      mountPairingSetupConnectionsViewerController({
        read: () => committed.current.read(),
        setOpen: (open) => committed.current.setOpen(open)
      }),
    []
  )
}
