import { useMobileSettingsConnectionsViewerController } from '@/hooks/useMobileSettingsConnectionsViewerController'
import type { MobileSettingsConnectionsViewerState } from '../../../../shared/connections-viewer'
import { normalizeMobilePairingCustomAddress } from '../../../../shared/mobile-pairing-custom-address'
export function useMobilePaneViewerController(input: {
  state: MobileSettingsConnectionsViewerState
  pairingUrl: string | null
  canGenerate: boolean
  selectedAddress: string | undefined
  customAddresses: readonly string[]
  addresses: readonly string[]
  deviceIds: readonly string[]
  mode: (value: 'automatic' | 'local-only') => void
  select: (value: string) => void
  customAdd: (value: string) => void
  customRemove: (value: string) => void
  generate: (rotate: boolean) => Promise<void>
  refresh: () => Promise<boolean>
  enlarge: (open: boolean) => void
  autoRestore: (ms: number | null) => Promise<void>
  revoke: (id: string) => Promise<void>
  copyDiagnostics: () => Promise<boolean>
}): void {
  useMobileSettingsConnectionsViewerController({
    read: () => input.state,
    pairingIdentity: () => input.pairingUrl,
    canGenerate: () => input.canGenerate,
    mode: input.mode,
    address: (value) => {
      if (!input.addresses.includes(value)) {
        return false
      }
      input.select(value)
      return true
    },
    customAdd: (value) => {
      const normalized = normalizeMobilePairingCustomAddress(value)
      if (!normalized) {
        return false
      }
      input.customAdd(normalized)
      return true
    },
    customRemove: (value) => {
      const normalized = normalizeMobilePairingCustomAddress(value)
      if (!normalized || !input.customAddresses.includes(normalized)) {
        return false
      }
      input.customRemove(normalized)
      return true
    },
    matches: (kind, value) => {
      const normalized = normalizeMobilePairingCustomAddress(value)
      return kind === 'address'
        ? input.selectedAddress === value
        : kind === 'custom-add'
          ? input.selectedAddress === normalized &&
            normalized !== null &&
            input.customAddresses.includes(normalized)
          : normalized !== null && !input.customAddresses.includes(normalized)
    },
    generate: input.generate,
    refresh: input.refresh,
    enlarge: input.enlarge,
    autoRestore: input.autoRestore,
    revoke: input.revoke,
    hasDevice: (id) => input.deviceIds.includes(id),
    copyDiagnostics: input.copyDiagnostics,
    persisted: async (kind, value) => {
      const settings = await window.api.settings.get()
      return kind === 'mode'
        ? settings.mobilePairingConnectionMode === value
        : (settings.mobileAutoRestoreFitMs ?? null) === value
    }
  })
}
