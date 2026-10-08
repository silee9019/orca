// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, waitFor, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobilePage from './MobilePage'
import { getInstallCopy, ANDROID_INSTALL_GUIDE_URL } from './mobile-platform-copy'
import { TooltipProvider } from '../ui/tooltip'
import { applyMobileConnectionsViewerRequest } from '@/runtime/mobile-connections-viewer-controller'
import { _resetPairedMobileDevicesCacheForTests } from './paired-mobile-devices'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const clipboard = vi.fn(),
  pairing = vi.fn(),
  listDevices = vi.fn(),
  revokeDevice = vi.fn(),
  openUrl = vi.fn()
const store = vi.hoisted(() => ({
  activeView: 'mobile',
  closeMobilePage: vi.fn(),
  orcaProfileAuthStatus: { state: 'connected' },
  settings: { showMobileButton: true },
  updateSettings: vi.fn().mockResolvedValue(undefined),
  fetchOrcaProfileAuthStatus: vi.fn().mockResolvedValue(null)
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: typeof store) => unknown) => selector(store), {
    getState: () => store
  })
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
vi.mock('./use-mobile-install-qr', () => ({ useMobileInstallQr: () => null }))
vi.mock('./use-mobile-page-escape', () => ({ useMobilePageEscape: vi.fn() }))
vi.mock('../settings/mobile-pairing-device-polling', () => ({
  useMobilePairingDevicePolling: vi.fn()
}))
beforeEach(() => {
  vi.clearAllMocks()
  _resetPairedMobileDevicesCacheForTests()
  clipboard.mockResolvedValue(undefined)
  openUrl.mockResolvedValue(undefined)
  listDevices.mockResolvedValue({ devices: [] })
  revokeDevice.mockResolvedValue({ revoked: true })
  pairing.mockResolvedValue({
    available: true,
    qrDataUrl: 'data:image/png;base64,fixture',
    qrSize: 218,
    pairingUrl: 'orca://pair#private-pairing-canary'
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      mobile: {
        getPairingQR: pairing,
        listDevices,
        revokeDevice,
        listNetworkInterfaces: vi.fn().mockResolvedValue({ interfaces: [] }),
        onRelayStatusChanged: vi.fn().mockReturnValue(() => {}),
        getRelayStatus: vi.fn().mockResolvedValue({ status: 'disconnected', cellUrl: null })
      },
      ui: { writeClipboardText: clipboard },
      shell: { openUrl }
    }
  })
})
afterEach(cleanup)
async function invoke(command: ConnectionsViewerCommand) {
  let pending
  await act(async () => {
    pending = applyMobileConnectionsViewerRequest({
      id: 'copy',
      expiresAt: Date.now() + 1500,
      command
    })
    void pending.catch(() => {})
  })
  return pending
}
async function mountPairing() {
  render(
    <TooltipProvider>
      <MobilePage />
    </TooltipProvider>
  )
  await waitFor(async () =>
    expect((await invoke({ viewerId: 7, operation: 'mobile.get' })).state.stage).toBe('intro')
  )
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.continue' })
  await waitFor(async () =>
    expect((await invoke({ viewerId: 7, operation: 'mobile.get' })).state.pairingAvailable).toBe(
      true
    )
  )
}
it('copies the actual MobilePage pairing offer through its existing clipboard owner without returning the offer', async () => {
  await mountPairing()
  const result = await invoke({ viewerId: 7, operation: 'mobile.copy-pairing' })
  expect(result).toMatchObject({ applied: true, persisted: null })
  expect(clipboard).toHaveBeenCalledExactlyOnceWith('orca://pair#private-pairing-canary')
  expect(JSON.stringify(result)).not.toContain('private-pairing-canary')
  clipboard.mockClear()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy pairing code' }))
  })
  expect(clipboard).toHaveBeenCalledExactlyOnceWith('orca://pair#private-pairing-canary')
})
it('does not acknowledge a missing pairing offer', async () => {
  render(
    <TooltipProvider>
      <MobilePage />
    </TooltipProvider>
  )
  const result = await invoke({ viewerId: 7, operation: 'mobile.copy-pairing' })
  expect(result).toMatchObject({ applied: false })
  expect(clipboard).not.toHaveBeenCalled()
})
it('does not acknowledge clipboard rejection or log its private value', async () => {
  await mountPairing()
  clipboard.mockRejectedValueOnce(new Error('private-clipboard-canary'))
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const result = await invoke({ viewerId: 7, operation: 'mobile.copy-pairing' })
    expect(result).toMatchObject({ applied: false })
    expect(JSON.stringify(result)).not.toContain('private-clipboard-canary')
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith('writeClipboardText failed')
  } finally {
    diagnostic.mockRestore()
  }
})

const phoneA = { deviceId: 'phone-a', name: 'Phone A', pairedAt: 1, lastSeenAt: 2 }
const phoneB = { deviceId: 'phone-b', name: 'Phone B', pairedAt: 1, lastSeenAt: 2 }
async function mountPaired() {
  listDevices.mockResolvedValue({ devices: [phoneA, phoneB] })
  render(
    <TooltipProvider>
      <MobilePage />
    </TooltipProvider>
  )
  await waitFor(() => expect(screen.getByText('Phone A')).toBeVisible())
}
it('revokes only the explicitly confirmed device through the actual parent and canonical absence readback', async () => {
  await mountPaired()
  revokeDevice.mockImplementationOnce(async () => {
    listDevices.mockResolvedValue({ devices: [phoneB] })
    return { revoked: true }
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'mobile.revoke-device',
    confirmDevice: 'phone-a'
  })
  expect(result).toMatchObject({ applied: true, state: { deviceCount: 1, stage: 'paired' } })
  expect(revokeDevice).toHaveBeenCalledExactlyOnceWith({ deviceId: 'phone-a' })
  expect(screen.queryByText('Phone A')).not.toBeInTheDocument()
  expect(screen.getByText('Phone B')).toBeVisible()
  revokeDevice.mockImplementationOnce(async () => {
    listDevices.mockResolvedValue({ devices: [] })
    return { revoked: true }
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Phone B' }))
  })
  expect(revokeDevice).toHaveBeenLastCalledWith({ deviceId: 'phone-b' })
  expect(screen.queryByText('Phone B')).not.toBeInTheDocument()
})
it('rejects an unknown exact device before its owner is invoked', async () => {
  await mountPaired()
  await expect(
    invoke({ viewerId: 7, operation: 'mobile.revoke-device', confirmDevice: 'other-phone' })
  ).rejects.toThrow('mobile_device_not_found')
  expect(revokeDevice).not.toHaveBeenCalled()
})
it('does not acknowledge revoked=false and preserves the actual paired list', async () => {
  await mountPaired()
  revokeDevice.mockResolvedValueOnce({ revoked: false })
  const result = await invoke({
    viewerId: 7,
    operation: 'mobile.revoke-device',
    confirmDevice: 'phone-a'
  })
  expect(result).toMatchObject({ applied: false, state: { deviceCount: 2 } })
  expect(screen.getByText('Phone A')).toBeVisible()
  expect(listDevices).toHaveBeenCalledTimes(1)
})
it('does not acknowledge revocation while the canonical refresh still contains the device', async () => {
  await mountPaired()
  const result = await invoke({
    viewerId: 7,
    operation: 'mobile.revoke-device',
    confirmDevice: 'phone-a'
  })
  expect(result).toMatchObject({ applied: false, state: { deviceCount: 2 } })
  expect(screen.getByText('Phone A')).toBeVisible()
})

it('uses the same install owners for actual HeroFlow and Android help DOM controls and viewer commands', async () => {
  render(
    <TooltipProvider>
      <MobilePage />
    </TooltipProvider>
  )
  await waitFor(async () =>
    expect((await invoke({ viewerId: 7, operation: 'mobile.get' })).state.stage).toBe('intro')
  )
  await invoke({ viewerId: 7, operation: 'mobile.start' })
  await invoke({ viewerId: 7, operation: 'mobile.platform', value: 'android' })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy install link' }))
  })
  expect(clipboard).toHaveBeenCalledExactlyOnceWith(getInstallCopy('android', 'preview').url)
  clipboard.mockClear()
  expect(await invoke({ viewerId: 7, operation: 'mobile.copy-install' })).toMatchObject({
    applied: true
  })
  expect(clipboard).toHaveBeenCalledExactlyOnceWith(getInstallCopy('android', 'preview').url)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Download APK' }))
  })
  expect(openUrl).toHaveBeenLastCalledWith(getInstallCopy('android', 'preview').url)
  openUrl.mockClear()
  expect(await invoke({ viewerId: 7, operation: 'mobile.open-install' })).toMatchObject({
    applied: true
  })
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(getInstallCopy('android', 'preview').url)
  openUrl.mockClear()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Install guide' }))
  })
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(ANDROID_INSTALL_GUIDE_URL)
  openUrl.mockClear()
  expect(await invoke({ viewerId: 7, operation: 'mobile.open-android-guide' })).toMatchObject({
    applied: true
  })
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(ANDROID_INSTALL_GUIDE_URL)
})

it('deduplicates two exact-device requests before React commits and releases the guard after failure', async () => {
  await mountPaired()
  let finish: (value: { revoked: boolean }) => void = () => {
    throw new Error('missing_fixture_resolver')
  }
  revokeDevice.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let results
  await act(async () => {
    const command = {
      viewerId: 7,
      operation: 'mobile.revoke-device',
      confirmDevice: 'phone-a'
    } as const
    const first = applyMobileConnectionsViewerRequest({
      id: 'race-a',
      expiresAt: Date.now() + 1000,
      command
    })
    const second = applyMobileConnectionsViewerRequest({
      id: 'race-b',
      expiresAt: Date.now() + 1000,
      command
    })
    expect(revokeDevice).toHaveBeenCalledTimes(1)
    finish({ revoked: false })
    results = await Promise.all([first, second])
  })
  expect(results).toMatchObject([{ applied: false }, { applied: false }])
  revokeDevice.mockImplementationOnce(async () => {
    listDevices.mockResolvedValue({ devices: [phoneB] })
    return { revoked: true }
  })
  expect(
    await invoke({ viewerId: 7, operation: 'mobile.revoke-device', confirmDevice: 'phone-a' })
  ).toMatchObject({ applied: true })
  expect(revokeDevice).toHaveBeenCalledTimes(2)
})
it('preserves the optimistic UI fallback but does not claim server-list verification after refresh failure', async () => {
  await mountPaired()
  listDevices.mockRejectedValueOnce(new Error('private-refresh-error-canary'))
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const result = await invoke({
      viewerId: 7,
      operation: 'mobile.revoke-device',
      confirmDevice: 'phone-a'
    })
    expect(result).toMatchObject({ applied: false, state: { deviceCount: 1 } })
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith('mobile.listDevices failed after revoke')
    expect(JSON.stringify(result)).not.toContain('private-refresh-error-canary')
    expect(screen.queryByText('Phone A')).not.toBeInTheDocument()
    expect(screen.getByText('Phone B')).toBeVisible()
  } finally {
    diagnostic.mockRestore()
  }
})
