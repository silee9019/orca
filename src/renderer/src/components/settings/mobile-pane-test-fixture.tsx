// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { vi, type Mock } from 'vitest'
import type { PairedMobileDevice } from '../mobile/paired-mobile-devices'
import type { MobilePairingConnectionMode } from '../../../../shared/mobile-pairing-connection-mode'

export type PairedDevice = PairedMobileDevice

type PairedDevicesProps = {
  devices: readonly PairedDevice[]
  hasQrCode: boolean
  onRevokeDevice: (deviceId: string) => void
}

type StoreState = {
  orcaProfileAuthStatus: { state: 'connected' | 'local' }
  settingsSearchQuery: string
  settings: {
    mobileAutoRestoreFitMs: number | null
    mobilePairingConnectionMode?: MobilePairingConnectionMode
    mobilePairingCustomAddress?: string | null
    mobilePairingCustomAddresses?: string[]
  }
  updateSettings: (patch: Record<string, unknown>) => Promise<void>
  recordFeatureInteraction: (feature: string) => void
  fetchOrcaProfileAuthStatus: () => Promise<unknown>
}

const mocks: {
  holder: { state: StoreState }
  useAppStore: ((selector: (state: StoreState) => unknown) => unknown) & {
    getState: () => StoreState
  }
  latestPairedDevicesProps: PairedDevicesProps | null
  getPairingQR: Mock
  listDevices: Mock
  listNetworkInterfaces: Mock
  revokeDevice: Mock
  toastError: Mock
  toastSuccess: Mock
  updateSettings: Mock
} = vi.hoisted(() => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: each suite assigns the full store state before rendering.
  const holder: { state: StoreState } = { state: {} as StoreState }
  const useAppStore = Object.assign(
    (selector: (state: StoreState) => unknown) => selector(holder.state),
    { getState: () => holder.state }
  )
  return {
    holder,
    useAppStore,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the component mock writes only PairedDevicesProps; null means no render yet.
    latestPairedDevicesProps: null as PairedDevicesProps | null,
    getPairingQR: vi.fn(),
    listDevices: vi.fn(),
    listNetworkInterfaces: vi.fn(),
    revokeDevice: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    updateSettings: vi.fn()
  }
})

vi.mock('@/store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('../../store', () => ({ useAppStore: mocks.useAppStore }))

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess
  }
}))
vi.mock('./mobile-pairing-device-polling', () => ({ useMobilePairingDevicePolling: vi.fn() }))

// Stub the child sections so the test targets MobilePane's own connection-mode
// safety wiring (effective mode, canGenerate gate, persistence) in isolation.
vi.mock('./MobilePairingSetupSection', () => ({
  MobilePairingSetupSection: (props: {
    connectionMode: MobilePairingConnectionMode
    canGenerate?: boolean
    loading: boolean
    connectionPathControl: React.ReactNode
    networkInterfaces: { name: string; address: string }[]
    customAddresses: readonly string[]
    selectedAddress: string | undefined
    selectedAddressIsCustom: boolean
    onSelectedAddressChange: (address: string) => void
    onCustomAddressSelect: (address: string) => void
    onCustomAddressRemove: (address: string) => void
    refreshingNetworkInterfaces: boolean
    onRefreshNetworkInterfaces: () => void
    onGenerateQr: () => void
  }) => (
    <div>
      <span data-testid="mode">{props.connectionMode}</span>
      <span data-testid="can-generate">{String(props.canGenerate)}</span>
      <span data-testid="loading">{String(props.loading)}</span>
      <span data-testid="selected-address">{props.selectedAddress ?? 'none'}</span>
      <span data-testid="selected-address-is-custom">{String(props.selectedAddressIsCustom)}</span>
      <span data-testid="custom-addresses">{props.customAddresses.join(',')}</span>
      <span data-testid="refreshing-addresses">{String(props.refreshingNetworkInterfaces)}</span>
      {props.connectionPathControl}
      {/* Mirror the real Generate gate (loading/canGenerate) so a stuck
          loading flag surfaces as a disabled control the tests can catch. */}
      <button
        type="button"
        onClick={props.onGenerateQr}
        disabled={props.loading || props.canGenerate === false}
      >
        Generate
      </button>
      <button type="button" onClick={() => props.onCustomAddressSelect('100.126.117.25:6768')}>
        choose-custom-address
      </button>
      <button type="button" onClick={() => props.onCustomAddressRemove('100.126.117.25:6768')}>
        remove-custom-address
      </button>
      <button
        type="button"
        disabled={props.networkInterfaces.length === 0}
        onClick={() => props.onSelectedAddressChange(props.networkInterfaces[0]!.address)}
      >
        choose-discovered-address
      </button>
      <button type="button" onClick={props.onRefreshNetworkInterfaces}>
        refresh-addresses
      </button>
    </div>
  )
}))
vi.mock('./MobilePairingConnectionOptions', () => ({
  MobilePairingConnectionOptions: (props: {
    onChange: (mode: MobilePairingConnectionMode) => void
  }) => (
    <div>
      <button type="button" onClick={() => props.onChange('automatic')}>
        choose-anywhere
      </button>
      <button type="button" onClick={() => props.onChange('local-only')}>
        choose-local
      </button>
    </div>
  )
}))
vi.mock('./MobilePairingQrSection', () => ({
  MobilePairingQrSection: (props: {
    qrDataUrl: string | null
    pairingUrl: string | null
    qrError: boolean
  }) => (
    <div>
      <span data-testid="qr">{props.qrDataUrl ?? 'none'}</span>
      <span data-testid="pairing-url">{props.pairingUrl ?? 'none'}</span>
      <span data-testid="qr-error">{String(props.qrError)}</span>
    </div>
  )
}))
vi.mock('./MobilePairedDevicesSection', () => ({
  MobilePairedDevicesSection: (props: PairedDevicesProps) => {
    mocks.latestPairedDevicesProps = props
    return <div data-testid="paired-devices">{props.devices.map((d) => d.deviceId).join(',')}</div>
  }
}))
vi.mock('./MobileAutoRestoreFitSection', () => ({ MobileAutoRestoreFitSection: () => <div /> }))
vi.mock('../mobile/WindowsFirewallNotice', () => ({
  WindowsFirewallNotice: (props: { usingRelay?: boolean }) => (
    <div data-testid="firewall-notice">{String(props.usingRelay)}</div>
  )
}))

export { mocks }
