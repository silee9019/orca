// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import { MobileSettingsPane } from './MobileSettingsPane'
import SidebarNav from '../sidebar/SidebarNav'
import { TooltipProvider } from '../ui/tooltip'
import { _resetPairedMobileDevicesCacheForTests } from '../mobile/paired-mobile-devices'
import { applyMobileNavigationViewerRequest } from '@/runtime/mobile-navigation-viewer'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import { getInstallCopy } from '../mobile/mobile-platform-copy'
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./mobile-pairing-device-polling', () => ({ useMobilePairingDevicePolling: vi.fn() }))
const openUrl = vi.fn()
const settingsRead = vi.fn()
const devices = vi.fn()
beforeEach(() => {
  window.localStorage.clear()
  _resetPairedMobileDevicesCacheForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: createGlobalSettingsFixture({ showMobileButton: true }),
    updateSettings: async (patch) => {
      const current = useAppStore.getState().settings
      if (current) {
        useAppStore.setState({ settings: { ...current, ...patch } })
      }
    }
  })
  settingsRead.mockReset().mockImplementation(async () => useAppStore.getState().settings)
  devices.mockReset().mockResolvedValue({ devices: [] })
  openUrl.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      mobile: {
        listNetworkInterfaces: vi.fn().mockResolvedValue({ interfaces: [] }),
        listDevices: devices,
        onRelayStatusChanged: vi.fn().mockReturnValue(() => {}),
        getRelayStatus: vi.fn().mockResolvedValue({ status: 'idle', cellUrl: null })
      },
      shell: { openUrl },
      settings: { get: settingsRead }
    }
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
async function invoke(command: ConnectionsViewerCommand) {
  let pending!: ReturnType<typeof applyMobileNavigationViewerRequest>
  await act(async () => {
    pending = applyMobileNavigationViewerRequest({
      id: 'mobile-navigation',
      expiresAt: Date.now() + 500,
      command
    })
    void pending.catch(() => {})
  })
  let done = false
  void pending
    .finally(() => {
      done = true
    })
    .catch(() => {})
  while (!done) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  return pending
}
it('reuses actual settings switch and both installation targets with canonical readback', async () => {
  render(
    <TooltipProvider>
      <MobileSettingsPane />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('switch', { name: 'Show Orca Mobile Button' }))
  expect(useAppStore.getState().settings?.showMobileButton).toBe(false)
  expect(
    await invoke({
      operation: 'mobile-navigation.visibility',
      viewerId: 7,
      surface: 'settings',
      shown: true
    })
  ).toMatchObject({ applied: true, persisted: true, state: { showButton: true } })
  fireEvent.click(screen.getByRole('button', { name: 'App Store' }))
  fireEvent.click(screen.getByRole('button', { name: 'Android APK' }))
  expect(openUrl).toHaveBeenCalledWith(getInstallCopy('ios', 'stable').url)
  expect(openUrl).toHaveBeenCalledWith(getInstallCopy('android', 'stable').url)
  expect(
    await invoke({
      operation: 'mobile-navigation.open-install',
      viewerId: 7,
      surface: 'settings',
      platform: 'ios'
    })
  ).toMatchObject({ applied: true })
  expect(
    await invoke({
      operation: 'mobile-navigation.open-install',
      viewerId: 7,
      surface: 'settings',
      platform: 'android'
    })
  ).toMatchObject({ applied: true })
  openUrl.mockRejectedValueOnce(new Error('provider-private-error'))
  expect(
    await invoke({
      operation: 'mobile-navigation.open-install',
      viewerId: 7,
      surface: 'settings',
      platform: 'ios'
    })
  ).toMatchObject({ applied: false })
  settingsRead.mockResolvedValueOnce(createGlobalSettingsFixture({ showMobileButton: true }))
  expect(
    await invoke({
      operation: 'mobile-navigation.visibility',
      viewerId: 7,
      surface: 'settings',
      shown: false
    })
  ).toMatchObject({ applied: true, persisted: false })
})
it('uses the real sidebar badge dismissal and hide callback', async () => {
  render(
    <TooltipProvider>
      <SidebarNav />
    </TooltipProvider>
  )
  await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /Mobile/ }))
  expect(window.localStorage.getItem('orca.mobile.sidebar-onboarding-dismissed')).toBe('1')
  expect(
    await invoke({ operation: 'mobile-navigation.get', viewerId: 7, surface: 'sidebar' })
  ).toMatchObject({ state: { badgeVisible: false } })
  expect(
    await invoke({ operation: 'mobile-navigation.dismiss-badge', viewerId: 7, surface: 'sidebar' })
  ).toMatchObject({ applied: true, persisted: true })
  expect(
    await invoke({
      operation: 'mobile-navigation.visibility',
      viewerId: 7,
      surface: 'sidebar',
      shown: false
    })
  ).toMatchObject({ applied: true, persisted: true, state: { showButton: false } })
  expect(screen.queryByRole('button', { name: /Mobile/ })).not.toBeInTheDocument()
})

it('dismisses a fresh actual badge through the typed path and preserves storage failure', async () => {
  render(
    <TooltipProvider>
      <SidebarNav />
    </TooltipProvider>
  )
  await screen.findByText('New')
  const storage = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('storage-private-error')
  })
  expect(
    await invoke({ operation: 'mobile-navigation.dismiss-badge', viewerId: 7, surface: 'sidebar' })
  ).toMatchObject({ applied: true, persisted: false, state: { badgeVisible: false } })
  expect(screen.queryByText('New')).not.toBeInTheDocument()
  storage.mockRestore()
})
it('hides the actual paired-device sidebar shortcut through its native button', async () => {
  devices.mockResolvedValue({
    devices: [{ deviceId: 'phone-a', name: 'Phone A', pairedAt: 1, lastSeenAt: 2 }]
  })
  render(
    <TooltipProvider>
      <SidebarNav />
    </TooltipProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Hide from sidebar' }))
  await waitFor(() => expect(useAppStore.getState().settings?.showMobileButton).toBe(false))
  expect(screen.queryByRole('button', { name: /Mobile/ })).not.toBeInTheDocument()
})

it('uses the native context menu hide binding', async () => {
  render(
    <TooltipProvider>
      <SidebarNav />
    </TooltipProvider>
  )
  fireEvent.contextMenu(screen.getByRole('button', { name: /Mobile/ }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide from sidebar' }))
  await waitFor(() => expect(useAppStore.getState().settings?.showMobileButton).toBe(false))
})
