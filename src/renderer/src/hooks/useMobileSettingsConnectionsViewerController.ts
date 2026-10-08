import { useEffect, useRef } from 'react'
import {
  mountMobileSettingsConnectionsViewerController,
  type MobileSettingsConnectionsViewerController
} from '@/runtime/mobile-settings-connections-viewer-controller'
export function useMobileSettingsConnectionsViewerController(
  controller: MobileSettingsConnectionsViewerController
): void {
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      mountMobileSettingsConnectionsViewerController({
        read: () => committed.current.read(),
        canGenerate: () => committed.current.canGenerate(),
        pairingIdentity: () => committed.current.pairingIdentity(),
        mode: (value) => committed.current.mode(value),
        address: (value) => committed.current.address(value),
        customAdd: (value) => committed.current.customAdd(value),
        customRemove: (value) => committed.current.customRemove(value),
        matches: (kind, value) => committed.current.matches(kind, value),
        generate: (rotate) => committed.current.generate(rotate),
        refresh: () => committed.current.refresh(),
        enlarge: (open) => committed.current.enlarge(open),
        autoRestore: (ms) => committed.current.autoRestore(ms),
        revoke: (id) => committed.current.revoke(id),
        hasDevice: (id) => committed.current.hasDevice(id),
        copyDiagnostics: () => committed.current.copyDiagnostics(),
        persisted: (kind, value) => committed.current.persisted(kind, value)
      }),
    []
  )
}
