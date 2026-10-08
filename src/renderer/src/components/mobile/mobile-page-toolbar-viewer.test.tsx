// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import MobilePage from './MobilePage'
import { TooltipProvider } from '../ui/tooltip'
import { applyMobileConnectionsViewerRequest } from '@/runtime/mobile-connections-viewer-controller'
import { applyPairingSetupConnectionsViewerRequest } from '@/runtime/pairing-setup-connections-viewer-controller'
import { _resetPairedMobileDevicesCacheForTests } from './paired-mobile-devices'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const network = vi.fn(),
  devices = vi.fn(),
  clipboard = vi.fn(),
  settingsRead = vi.fn(),
  updateSettings = vi.fn(),
  pairing = vi.fn()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
vi.mock('./use-mobile-install-qr', () => ({ useMobileInstallQr: () => null }))
vi.mock('./use-mobile-page-escape', () => ({ useMobilePageEscape: vi.fn() }))
vi.mock('../settings/mobile-pairing-device-polling', () => ({
  useMobilePairingDevicePolling: vi.fn()
}))
beforeEach(() => {
  vi.clearAllMocks()
  _resetPairedMobileDevicesCacheForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: createGlobalSettingsFixture({ showMobileButton: true }),
    activeView: 'mobile',
    previousViewBeforeMobile: 'settings',
    fetchOrcaProfileAuthStatus: vi.fn().mockResolvedValue(null),
    orcaProfileAuthStatus: {
      activeProfileId: 'fixture',
      configured: true,
      state: 'connected',
      persistence: 'memory-only'
    }
  })
  updateSettings.mockImplementation(async (patch) => {
    const current = useAppStore.getState().settings
    if (current) {
      useAppStore.setState({ settings: { ...current, ...patch } })
    }
  })
  useAppStore.setState({ updateSettings })
  settingsRead.mockImplementation(async () => useAppStore.getState().settings)
  network.mockResolvedValue({ interfaces: [] })
  devices.mockResolvedValue({ devices: [] })
  clipboard.mockResolvedValue(undefined)
  pairing.mockResolvedValue({ available: true, qrDataUrl: null, qrSize: null, pairingUrl: null })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      mobile: {
        listDevices: devices,
        listNetworkInterfaces: network,
        getPairingQR: pairing,
        onRelayStatusChanged: vi.fn().mockReturnValue(() => {}),
        getRelayStatus: vi.fn().mockResolvedValue({ status: 'idle', cellUrl: null })
      },
      ui: { writeClipboardText: clipboard },
      settings: { get: settingsRead },
      shell: { openUrl: vi.fn() }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

it('keeps native and typed start, back, platform, channel and continue on the real page flow', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { stage: 'flow', step: 0 }
  })
  expect(await invoke({ viewerId: 7, operation: 'mobile.back' })).toMatchObject({
    applied: true,
    state: { stage: 'intro' }
  })
  expect(await invoke({ viewerId: 7, operation: 'mobile.start' })).toMatchObject({
    applied: true,
    state: { stage: 'flow', step: 0 }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Android' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { platform: 'android' }
  })
  expect(await invoke({ viewerId: 7, operation: 'mobile.platform', value: 'ios' })).toMatchObject({
    applied: true,
    state: { platform: 'ios' }
  })
  expect(screen.getByRole('button', { name: 'iOS' })).toHaveAttribute('aria-pressed', 'true')
  await invoke({ viewerId: 7, operation: 'mobile.platform', value: 'android' })
  fireEvent.click(screen.getByRole('button', { name: 'iOS' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { platform: 'ios' }
  })
  fireEvent.click(screen.getByRole('radio', { name: 'Stable' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { iosChannel: 'stable' }
  })
  expect(
    await invoke({ viewerId: 7, operation: 'mobile.ios-channel', value: 'preview' })
  ).toMatchObject({
    applied: true,
    state: { iosChannel: 'preview' }
  })
  expect(screen.getByRole('radio', { name: 'Preview' })).toHaveAttribute('aria-checked', 'true')
  await invoke({ viewerId: 7, operation: 'mobile.ios-channel', value: 'stable' })
  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { iosChannel: 'preview' }
  })
  expect(await invoke({ viewerId: 7, operation: 'mobile.continue' })).toMatchObject({
    applied: true,
    state: { step: 1 }
  })
  const back = document.querySelector<HTMLButtonElement>('.mp-flow-back')
  if (!back) {
    throw new Error('missing_flow_back')
  }
  fireEvent.click(back)
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { step: 0 }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { step: 1 }
  })
  await expect(invoke({ viewerId: 7, operation: 'mobile.done' })).rejects.toThrow(
    'paired_device_required'
  )
})

it('uses the paired-device parent for native and typed done, pair-another and back', async () => {
  devices.mockResolvedValue({
    devices: [{ deviceId: 'phone-a', name: 'Phone A', pairedAt: 1, lastSeenAt: 2 }]
  })
  render(<Surface />)
  await waitFor(() => expect(screen.getByText('Phone A')).toBeVisible())
  fireEvent.click(screen.getByRole('button', { name: 'Pair another device' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { stage: 'flow', step: 1, deviceCount: 1 }
  })
  expect(await invoke({ viewerId: 7, operation: 'mobile.done' })).toMatchObject({
    applied: true,
    state: { stage: 'paired', deviceCount: 1 }
  })
  expect(screen.getByText('Phone A')).toBeVisible()
  expect(await invoke({ viewerId: 7, operation: 'mobile.pair-another' })).toMatchObject({
    applied: true,
    state: { stage: 'flow', step: 1 }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { stage: 'paired', deviceCount: 1 }
  })
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  expect(await invoke({ viewerId: 7, operation: 'mobile.back' })).toMatchObject({
    applied: true,
    state: { stage: 'paired', deviceCount: 1 }
  })
})

it('uses native and typed address changes through the real page settings owner', async () => {
  useAppStore.setState({
    settings: createGlobalSettingsFixture({ mobilePairingConnectionMode: 'local-only' })
  })
  network.mockResolvedValue({
    interfaces: [
      { name: 'fixture-a', address: '192.0.2.10', family: 'IPv4', internal: false },
      { name: 'fixture-b', address: '192.0.2.20', family: 'IPv4', internal: false }
    ]
  })
  pairing.mockResolvedValue({
    available: true,
    qrDataUrl: 'data:image/png;base64,fixture',
    qrSize: 64,
    pairingUrl: 'fixture-pairing'
  })
  await mount()
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.continue' })
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Network address to advertise' })).toBeEnabled()
  )
  expect(
    await invoke({ viewerId: 7, operation: 'mobile.address', value: '192.0.2.20' })
  ).toMatchObject({ applied: true, state: { selectedAddress: '192.0.2.20' } })
  fireEvent.click(screen.getByRole('combobox', { name: 'Network address to advertise' }))
  fireEvent.click(await screen.findByRole('option', { name: '192.0.2.10 (fixture-a)' }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { selectedAddress: '192.0.2.10' }
  })
  expect(
    await invoke({ viewerId: 7, operation: 'mobile.custom-add', value: 'typed.example.test' })
  ).toMatchObject({
    applied: true,
    state: { selectedAddress: 'typed.example.test', customAddresses: ['typed.example.test'] }
  })
  expect(useAppStore.getState().settings?.mobilePairingCustomAddress).toBe('typed.example.test')
  expect(
    await invoke({ viewerId: 7, operation: 'mobile.custom-remove', value: 'typed.example.test' })
  ).toMatchObject({ applied: true, state: { customAddresses: [] } })
  expect(useAppStore.getState().settings?.mobilePairingCustomAddresses).toEqual([])
  fireEvent.click(screen.getByRole('combobox', { name: 'Network address to advertise' }))
  fireEvent.click(await screen.findByRole('option', { name: 'Add custom address…' }))
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'native.example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use address' }))
  await waitFor(() =>
    expect(useAppStore.getState().settings?.mobilePairingCustomAddress).toBe('native.example.test')
  )
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { selectedAddress: 'native.example.test', customAddresses: ['native.example.test'] }
  })
  fireEvent.click(screen.getByRole('combobox', { name: 'Network address to advertise' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Remove native.example.test' }))
  await waitFor(() =>
    expect(useAppStore.getState().settings?.mobilePairingCustomAddresses).toEqual([])
  )
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { customAddresses: [] }
  })
  pairing.mockResolvedValueOnce({ available: false, reason: 'not_available' })
  await expect(
    invoke({ viewerId: 7, operation: 'mobile.custom-add', value: 'refused.example.test' })
  ).rejects.toThrow('custom_address_change_refused')
  expect(useAppStore.getState().settings?.mobilePairingCustomAddresses).toEqual([])
})

it('shares native and typed page mode and pairing generation owners', async () => {
  let serial = 0
  pairing.mockImplementation(async () => ({
    available: true,
    qrDataUrl: 'data:image/png;base64,fixture',
    qrSize: 64,
    pairingUrl: `fixture-pairing-${++serial}`
  }))
  await mount()
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.continue' })
  fireEvent.click(screen.getByRole('radio', { name: /LAN/ }))
  await waitFor(() =>
    expect(useAppStore.getState().settings?.mobilePairingConnectionMode).toBe('local-only')
  )
  expect(
    await invoke({ viewerId: 7, operation: 'mobile.connection-mode', value: 'automatic' })
  ).toMatchObject({ applied: true, state: { connectionMode: 'automatic' } })
  expect(useAppStore.getState().settings?.mobilePairingConnectionMode).toBe('automatic')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate code' })).toBeEnabled())
  pairing.mockClear()
  expect(await invoke({ viewerId: 7, operation: 'mobile.generate' })).toMatchObject({
    applied: true,
    state: { pairingAvailable: true, pairingLoading: false }
  })
  expect(pairing).toHaveBeenCalledWith(
    expect.objectContaining({ rotate: true, connectionMode: 'automatic' })
  )
  pairing.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate code' }))
  await waitFor(() =>
    expect(pairing).toHaveBeenCalledWith(
      expect.objectContaining({ rotate: true, connectionMode: 'automatic' })
    )
  )
  fireEvent.click(screen.getByRole('radio', { name: /LAN/ }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { connectionMode: 'local-only' }
  })
  fireEvent.click(screen.getByRole('radio', { name: /Orca Relay/ }))
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { connectionMode: 'automatic' }
  })
})

it('retries and switches to LAN through the real page failure notice', async () => {
  const failure = {
    available: false,
    reason: 'relay_mint_failed',
    relayFailure: {
      code: 'relay_control_not_active',
      stage: 'create_pairing_relay',
      message: 'Relay pairing invite request failed'
    }
  }
  pairing.mockResolvedValue(failure)
  await mount()
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.continue' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry Relay' })).toBeEnabled())
  pairing.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Retry Relay' }))
  await waitFor(() =>
    expect(pairing).toHaveBeenCalledWith(
      expect.objectContaining({ rotate: true, connectionMode: 'automatic' })
    )
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry Relay' })).toBeEnabled())
  pairing.mockResolvedValueOnce({
    available: true,
    qrDataUrl: 'data:image/png;base64,fixture',
    qrSize: 64,
    pairingUrl: 'retry-fixture'
  })
  expect(await invoke({ viewerId: 7, operation: 'mobile.retry-relay' })).toMatchObject({
    applied: true,
    state: { relayFailed: false, pairingAvailable: true }
  })
  pairing.mockResolvedValue(failure)
  await expect(invoke({ viewerId: 7, operation: 'mobile.generate' })).rejects.toThrow(
    'pairing_generation_failed'
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Use LAN' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Use LAN' }))
  await waitFor(() =>
    expect(useAppStore.getState().settings?.mobilePairingConnectionMode).toBe('local-only')
  )
  await invoke({ viewerId: 7, operation: 'mobile.connection-mode', value: 'automatic' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Use LAN' })).toBeEnabled())
  expect(await invoke({ viewerId: 7, operation: 'mobile.use-lan' })).toMatchObject({
    applied: true,
    state: { connectionMode: 'local-only' }
  })
  expect(useAppStore.getState().settings?.mobilePairingConnectionMode).toBe('local-only')
})

function Surface() {
  const view = useAppStore((s) => s.activeView)
  return (
    <TooltipProvider>
      {view === 'mobile' ? <MobilePage /> : <div>Previous view</div>}
    </TooltipProvider>
  )
}
async function mount() {
  render(<Surface />)
  await waitFor(async () =>
    expect((await invoke({ viewerId: 7, operation: 'mobile.get' })).state.stage).toBe('intro')
  )
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending
  await act(async () => {
    pending = applyMobileConnectionsViewerRequest({
      id: 'toolbar',
      expiresAt: Date.now() + 1000,
      command
    })
    void pending.catch(() => {})
  })
  return pending
}
it('acknowledges the canonical viewer close even though the intended surface unmounts', async () => {
  await mount()
  const result = await invoke({ viewerId: 7, operation: 'mobile.close' })
  expect(result).toMatchObject({ applied: true, persisted: null, state: { pageOpen: false } })
  expect(useAppStore.getState().activeView).toBe('settings')
  expect(screen.getByText('Previous view')).toBeVisible()
  expect(updateSettings).not.toHaveBeenCalled()
})
it('uses the original sidebar button owner and verifies UI settings and persisted settings', async () => {
  await mount()
  const result = await invoke({ viewerId: 7, operation: 'mobile.sidebar-toggle' })
  expect(result).toMatchObject({
    applied: true,
    persisted: true,
    state: { showMobileButton: false }
  })
  expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ showMobileButton: false })
  expect(settingsRead).toHaveBeenCalledOnce()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show in sidebar' }))
  })
  expect(updateSettings).toHaveBeenLastCalledWith({ showMobileButton: true })
})
it('does not acknowledge failed settings writes or stale persisted readback', async () => {
  await mount()
  updateSettings.mockRejectedValueOnce(new Error('private-settings-error-canary'))
  expect(await invoke({ viewerId: 7, operation: 'mobile.sidebar-toggle' })).toMatchObject({
    applied: false,
    persisted: false
  })
  settingsRead.mockResolvedValueOnce(createGlobalSettingsFixture({ showMobileButton: true }))
  const stale = await invoke({ viewerId: 7, operation: 'mobile.sidebar-toggle' })
  expect(stale).toMatchObject({ applied: true, persisted: false })
  expect(JSON.stringify(stale)).not.toContain('private-settings-error-canary')
})
it('waits for the original network owner and actual committed interface result', async () => {
  await mount()
  const interfaces = [
    { name: 'fixture', address: 'private-address-canary', family: 'IPv4', internal: false }
  ]
  network.mockResolvedValueOnce({ interfaces })
  const result = await invoke({ viewerId: 7, operation: 'mobile.refresh-network' })
  expect(result.applied).toBe(true)
  expect(network).toHaveBeenCalledOnce()
  network.mockRejectedValueOnce(new Error('private-network-error-canary'))
  expect(await invoke({ viewerId: 7, operation: 'mobile.refresh-network' })).toMatchObject({
    applied: false
  })
})
it('does not copy nonexistent relay diagnostics', async () => {
  await mount()
  expect(await invoke({ viewerId: 7, operation: 'mobile.copy-diagnostics' })).toMatchObject({
    applied: false
  })
  expect(clipboard).not.toHaveBeenCalled()
})

it('copies the existing relay diagnostic payload without the selected private address and distinguishes clipboard failure', async () => {
  pairing.mockResolvedValue({
    available: false,
    reason: 'relay_mint_failed',
    relayFailure: {
      code: 'relay_control_not_active',
      stage: 'create_pairing_relay',
      message: 'Relay pairing invite request failed'
    }
  })
  await mount()
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.continue' })
  await waitFor(async () =>
    expect((await invoke({ viewerId: 7, operation: 'mobile.get' })).state.relayFailed).toBe(true)
  )
  const result = await invoke({ viewerId: 7, operation: 'mobile.copy-diagnostics' })
  expect(result).toMatchObject({ applied: true, persisted: null })
  expect(clipboard).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('mobile_pairing_relay_failure')
  )
  expect(clipboard.mock.calls[0]?.[0]).not.toContain('selectedAddress')
  clipboard.mockClear()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }))
  })
  expect(clipboard).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('mobile_pairing_relay_failure')
  )
  clipboard.mockRejectedValueOnce(new Error('private-clipboard-error-canary'))
  const failed = await invoke({ viewerId: 7, operation: 'mobile.copy-diagnostics' })
  expect(failed.applied).toBe(false)
  expect(JSON.stringify(failed)).not.toContain('private-clipboard-error-canary')
})
it('rejects expired close without changing the canonical active view', async () => {
  await mount()
  await expect(
    applyMobileConnectionsViewerRequest({
      id: 'expired',
      expiresAt: Date.now() - 1,
      command: { viewerId: 7, operation: 'mobile.close' }
    })
  ).rejects.toThrow('request_expired')
  expect(useAppStore.getState().activeView).toBe('mobile')
})
it('uses the original toolbar DOM close control to return to the same canonical previous view', async () => {
  await mount()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Close Orca Mobile' }))
  })
  expect(useAppStore.getState().activeView).toBe('settings')
  expect(screen.getByText('Previous view')).toBeVisible()
})
it('uses the actual pairing network refresh DOM control and the same network owner', async () => {
  await mount()
  await invoke({ viewerId: 7, operation: 'mobile.connection-mode', value: 'local-only' })
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.continue' })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Refresh network interfaces' })).toBeEnabled()
  )
  network.mockClear()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh network interfaces' }))
  })
  expect(network).toHaveBeenCalledOnce()
})
it('does not acknowledge stale UI settings after a concurrent change during persisted readback', async () => {
  await mount()
  let finish: (value: ReturnType<typeof createGlobalSettingsFixture>) => void = () => {
    throw new Error('missing_fixture_resolver')
  }
  settingsRead.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let pending
  await act(async () => {
    pending = applyMobileConnectionsViewerRequest({
      id: 'sidebar-race',
      expiresAt: Date.now() + 1000,
      command: { viewerId: 7, operation: 'mobile.sidebar-toggle' }
    })
    await Promise.resolve()
    useAppStore.setState({ settings: createGlobalSettingsFixture({ showMobileButton: true }) })
    finish(createGlobalSettingsFixture({ showMobileButton: false }))
  })
  expect(await pending).toMatchObject({ applied: false, persisted: true })
  expect(useAppStore.getState().settings?.showMobileButton).toBe(true)
})

it('does not overwrite a different canonical view before React commits the mobile unmount', async () => {
  const closeOwner = vi.fn(useAppStore.getState().closeMobilePage)
  useAppStore.setState({ closeMobilePage: closeOwner })
  await mount()
  await act(async () => {
    useAppStore.setState({ activeView: 'skills' })
    await expect(
      applyMobileConnectionsViewerRequest({
        id: 'stale-close',
        expiresAt: Date.now() + 1000,
        command: { viewerId: 7, operation: 'mobile.close' }
      })
    ).rejects.toThrow('connections_surface_unavailable')
  })
  expect(useAppStore.getState().activeView).toBe('skills')
  expect(closeOwner).not.toHaveBeenCalled()
})
it('keeps radio keyboard selection and nested sign-in arrows on the original mode owner', async () => {
  await mount()
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.continue' })
  const lan = screen.getByRole('radio', { name: /LAN/ })
  const relay = screen.getByRole('radio', { name: /Orca Relay/ })
  fireEvent.keyDown(lan, { key: 'Enter' })
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { connectionMode: 'local-only' }
  })
  fireEvent.keyDown(relay, { key: ' ' })
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { connectionMode: 'automatic' }
  })
  fireEvent.keyDown(relay, { key: 'ArrowRight' })
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { connectionMode: 'local-only' }
  })
  expect(lan).toHaveFocus()
  fireEvent.keyDown(lan, { key: 'ArrowLeft' })
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { connectionMode: 'automatic' }
  })
  const connect = vi.fn()
  await act(async () => {
    useAppStore.setState({
      connectCurrentOrcaProfile: connect,
      orcaProfileAuthStatus: {
        activeProfileId: 'fixture',
        configured: true,
        state: 'local',
        persistence: 'memory-only'
      }
    })
  })
  const bubbled = vi.fn()
  document.addEventListener('keydown', bubbled)
  try {
    fireEvent.keyDown(screen.getByRole('button', { name: 'Sign in for Relay' }), {
      key: 'ArrowDown'
    })
    expect(bubbled).not.toHaveBeenCalled()
    expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
      state: { connectionMode: 'automatic' }
    })
    expect(connect).not.toHaveBeenCalled()
  } finally {
    document.removeEventListener('keydown', bubbled)
  }
  await invoke({ viewerId: 7, operation: 'mobile.connection-mode', value: 'local-only' })
  await act(async () => {
    useAppStore.setState({
      orcaProfileAuthStatus: {
        activeProfileId: 'fixture',
        configured: false,
        state: 'unconfigured',
        persistence: 'memory-only'
      }
    })
  })
  fireEvent.keyDown(relay, { key: 'Enter' })
  fireEvent.click(relay)
  expect(await invoke({ viewerId: 7, operation: 'mobile.get' })).toMatchObject({
    state: { connectionMode: 'local-only' }
  })
})

it('shares the actual Hero local-path disclosure with the existing pairing setup controller and keeps LAN/custom rows pinned', async () => {
  pairing.mockResolvedValue({
    available: true,
    qrDataUrl: 'data:image/png;base64,fixture',
    qrSize: 64,
    pairingUrl: 'disclosure-fixture'
  })
  await mount()
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.continue' })
  fireEvent.click(screen.getByRole('button', { name: 'Also use a faster local path' }))
  const disclosure = async (open: boolean) => {
    let pending: ReturnType<typeof applyPairingSetupConnectionsViewerRequest> | undefined
    await act(async () => {
      pending = applyPairingSetupConnectionsViewerRequest({
        id: 'hero-disclosure',
        expiresAt: Date.now() + 300,
        command: { viewerId: 7, operation: 'pairing-setup.disclosure', open }
      })
      void pending.catch(() => {})
    })
    if (!pending) {
      throw new Error('missing_request')
    }
    return pending
  }
  await expect(disclosure(false)).resolves.toMatchObject({ applied: true, state: { open: false } })
  expect(screen.getByRole('button', { name: 'Also use a faster local path' })).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  await expect(disclosure(true)).resolves.toMatchObject({ applied: true, state: { open: true } })
  expect(screen.getByRole('button', { name: 'Also use a faster local path' })).toHaveAttribute(
    'aria-expanded',
    'true'
  )
  await invoke({ viewerId: 7, operation: 'mobile.connection-mode', value: 'local-only' })
  await expect(disclosure(false)).rejects.toThrow('address_disclosure_required')
  await invoke({ viewerId: 7, operation: 'mobile.custom-add', value: 'pinned.example.test' })
  await invoke({ viewerId: 7, operation: 'mobile.connection-mode', value: 'automatic' })
  await expect(disclosure(false)).rejects.toThrow('address_disclosure_required')
})
