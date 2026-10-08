import { useCallback, type RefObject } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { MobilePairingConnectionMode } from '../../../../shared/mobile-pairing-connection-mode'
import type { MobileRelayMintFailure } from '../../../../shared/mobile-relay-mint-failure'

export function useMobileRelayDiagnosticsCopy({
  connectionMode,
  mountedRef,
  relayMintFailure,
  selectedAddress
}: {
  connectionMode: MobilePairingConnectionMode
  mountedRef: RefObject<boolean>
  relayMintFailure: MobileRelayMintFailure | null
  selectedAddress: string | undefined
}) {
  const copyRelayDiagnostics = useCallback(async (): Promise<boolean> => {
    if (relayMintFailure == null) {
      return false
    }
    try {
      await window.api.ui.writeClipboardText(
        JSON.stringify(
          {
            kind: 'mobile_pairing_relay_failure',
            preferredConnectionMode: connectionMode,
            failure: relayMintFailure,
            selectedAddress: selectedAddress ?? null,
            at: new Date().toISOString()
          },
          null,
          2
        )
      )
      if (mountedRef.current) {
        toast.success(
          translate('auto.components.settings.MobilePane.diagnosticsCopied', 'Diagnostics copied')
        )
      }
      return true
    } catch {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.settings.MobilePane.diagnosticsCopyFailed',
            'Failed to copy diagnostics'
          )
        )
      }
      return false
    }
  }, [connectionMode, mountedRef, relayMintFailure, selectedAddress])

  return copyRelayDiagnostics
}
