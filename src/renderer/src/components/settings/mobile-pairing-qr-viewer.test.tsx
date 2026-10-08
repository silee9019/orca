// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import { MobilePane } from './MobilePane'
import { TooltipProvider } from '../ui/tooltip'
import { _resetPairedMobileDevicesCacheForTests } from '../mobile/paired-mobile-devices'
import { applyMobileSettingsConnectionsViewerRequest } from '@/runtime/mobile-settings-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./mobile-pairing-device-polling', () => ({ useMobilePairingDevicePolling: vi.fn() }))
const clipboard = vi.fn()
const pairing = vi.fn()
beforeEach(() => {
  _resetPairedMobileDevicesCacheForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: createGlobalSettingsFixture({ mobilePairingConnectionMode: 'local-only' })
  })
  clipboard.mockReset().mockResolvedValue(undefined)
  pairing.mockReset().mockResolvedValue({
    available: true,
    qrDataUrl: 'data:image/png;base64,fixture',
    qrSize: 192,
    pairingUrl: 'orca://pair#private-secret',
    endpoint: 'ws://fixture'
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      mobile: {
        listNetworkInterfaces: vi
          .fn()
          .mockResolvedValue({ interfaces: [{ name: 'fixture', address: '192.0.2.1' }] }),
        listDevices: vi.fn().mockResolvedValue({ devices: [] }),
        getPairingQR: pairing,
        onRelayStatusChanged: vi.fn().mockReturnValue(() => {}),
        getRelayStatus: vi.fn().mockResolvedValue({ status: 'idle', cellUrl: null })
      },
      ui: { writeClipboardText: clipboard },
      settings: { get: vi.fn(async () => useAppStore.getState().settings) }
    }
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
async function invoke(command: ConnectionsViewerCommand) {
  let pending!: ReturnType<typeof applyMobileSettingsConnectionsViewerRequest>
  await act(async () => {
    pending = applyMobileSettingsConnectionsViewerRequest({
      id: 'qr-proof',
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
async function mount() {
  const view = render(
    <TooltipProvider>
      <MobilePane />
    </TooltipProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Generate QR code' }))
  await screen.findByRole('button', { name: 'Copy pairing code' })
  return view
}
it('uses real QR open/close and native/typed copy with parent feedback', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'QR Code for mobile pairing' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(
    await invoke({ viewerId: 7, operation: 'mobile-settings.qr-enlarge', open: false })
  ).toMatchObject({ applied: true, state: { qrEnlarged: false } })
  fireEvent.click(screen.getByRole('button', { name: 'Copy pairing code' }))
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith('orca://pair#private-secret'))
  const result = await invoke({ viewerId: 7, operation: 'mobile-settings.copy-pairing' })
  expect(result).toMatchObject({ applied: true })
  expect(
    screen.getByRole('button', { name: 'Copy pairing code' }).querySelector('.lucide-check')
  ).not.toBeNull()
  expect(JSON.stringify(result)).not.toMatch(/private-secret|orca:\/\/pair/)
  expect(
    await invoke({ viewerId: 7, operation: 'mobile-settings.qr-enlarge', open: true })
  ).toMatchObject({ applied: true, state: { qrEnlarged: true } })
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
it('rejects failed clipboard writes and late unmounted completion', async () => {
  const view = await mount()
  clipboard.mockRejectedValueOnce(new Error('private-clipboard-error'))
  await expect(invoke({ viewerId: 7, operation: 'mobile-settings.copy-pairing' })).rejects.toThrow(
    'clipboard_write_unconfirmed'
  )
  let resolve!: () => void
  clipboard.mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done
    })
  )
  const pending = applyMobileSettingsConnectionsViewerRequest({
    id: 'late',
    expiresAt: Date.now() + 500,
    command: { viewerId: 7, operation: 'mobile-settings.copy-pairing' }
  })
  const rejected = expect(pending).rejects.toThrow('clipboard_write_unconfirmed')
  view.unmount()
  resolve()
  await rejected
})

it('clears the actual QR copy feedback timer when the settings owner unmounts', async () => {
  const view = await mount()
  vi.useFakeTimers()
  const before = vi.getTimerCount()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy pairing code' }))
  })
  expect(
    screen.getByRole('button', { name: 'Copy pairing code' }).querySelector('.lucide-check')
  ).not.toBeNull()
  expect(vi.getTimerCount()).toBeGreaterThan(before)
  view.unmount()
  expect(vi.getTimerCount()).toBe(before)
})
