import { useEffect, useRef } from 'react'
import {
  mountMobileConnectionsViewerController,
  type MobileConnectionsViewerController
} from '@/runtime/mobile-connections-viewer-controller'
export function useMobileConnectionsViewerController(
  controller: MobileConnectionsViewerController
): void {
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      mountMobileConnectionsViewerController({
        closePage: () => committed.current.closePage?.(),
        pageOpen: () => {
          const read = committed.current.pageOpen
          if (!read) {
            throw new Error('connections_surface_unavailable')
          }
          return read()
        },
        toggleSidebar: () => committed.current.toggleSidebar?.() ?? Promise.resolve(undefined),
        sidebarShown: () => committed.current.sidebarShown?.() ?? false,
        refreshNetwork: () => committed.current.refreshNetwork?.() ?? Promise.resolve(null),
        networkInterfaces: () => committed.current.networkInterfaces?.() ?? [],
        copyDiagnostics: () => committed.current.copyDiagnostics?.() ?? Promise.resolve(false),
        hasDevice: (id) => committed.current.hasDevice?.(id) ?? false,
        isRevokingDevice: (id) => committed.current.isRevokingDevice?.(id) ?? false,
        revokeDevice: (id) => committed.current.revokeDevice?.(id) ?? Promise.resolve(false),
        copyPairing: () => committed.current.copyPairing?.() ?? Promise.resolve(false),
        copyInstall: () => committed.current.copyInstall?.() ?? Promise.resolve(false),
        openInstall: () => committed.current.openInstall?.() ?? Promise.resolve(false),
        openAndroidGuide: () => committed.current.openAndroidGuide?.() ?? Promise.resolve(false),
        read: () => committed.current.read(),
        pairingIdentity: () => committed.current.pairingIdentity(),
        relayFailureIdentity: () => committed.current.relayFailureIdentity(),
        canGeneratePairing: () => committed.current.canGeneratePairing(),
        setPlatform: (value) => committed.current.setPlatform(value),
        setIosChannel: (value) => committed.current.setIosChannel(value),
        setConnectionMode: (value) => committed.current.setConnectionMode(value),
        selectAddress: (value) => committed.current.selectAddress(value),
        beforeCustomAddressChange: (value) => committed.current.beforeCustomAddressChange(value),
        addCustomAddress: (value) => committed.current.addCustomAddress(value),
        removeCustomAddress: (value) => committed.current.removeCustomAddress(value),
        start: () => committed.current.start(),
        back: () => committed.current.back(),
        continue: () => committed.current.continue(),
        done: (count) => committed.current.done(count),
        pairAnother: () => committed.current.pairAnother(),
        useLan: () => committed.current.useLan(),
        generate: () => committed.current.generate(),
        retryRelay: () => committed.current.retryRelay()
      }),
    []
  )
}
