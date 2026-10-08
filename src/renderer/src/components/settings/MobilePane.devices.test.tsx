// @vitest-environment happy-dom
import { mocks, type PairedDevice } from './mobile-pane-test-fixture'
import { applyMobileSettingsConnectionsViewerRequest } from '@/runtime/mobile-settings-connections-viewer-controller'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetPairedMobileDevicesCacheForTests } from '../mobile/paired-mobile-devices'
import { MobilePane } from './MobilePane'

const mountedRoots: Root[] = []

function pairedDevice(deviceId: string): PairedDevice {
  return {
    deviceId,
    name: deviceId,
    pairedAt: 1,
    lastSeenAt: 2
  }
}

async function renderMobilePane(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => {
    root.render(<MobilePane />)
  })
}

async function unmountMobilePaneRoots(): Promise<void> {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) {
      root.unmount()
    }
  })
}

describe('MobilePane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetPairedMobileDevicesCacheForTests()
    mocks.latestPairedDevicesProps = null
    mocks.getPairingQR.mockReset().mockResolvedValue({
      available: true,
      qrDataUrl: 'data:image/png;base64,qr',
      pairingUrl: 'orca://pair',
      endpoint: 'ws://host'
    })
    mocks.listDevices.mockReset()
    mocks.listNetworkInterfaces.mockReset().mockResolvedValue({ interfaces: [] })
    mocks.revokeDevice.mockReset()
    mocks.updateSettings.mockReset().mockResolvedValue(undefined)
    mocks.holder.state = {
      orcaProfileAuthStatus: { state: 'connected' },
      settingsSearchQuery: '',
      settings: { mobileAutoRestoreFitMs: null },
      updateSettings: mocks.updateSettings,
      recordFeatureInteraction: vi.fn(),
      fetchOrcaProfileAuthStatus: vi.fn().mockResolvedValue(null)
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        mobile: {
          getPairingQR: mocks.getPairingQR,
          listDevices: mocks.listDevices,
          listNetworkInterfaces: mocks.listNetworkInterfaces,
          revokeDevice: mocks.revokeDevice
        }
      }
    })
  })

  afterEach(async () => {
    await unmountMobilePaneRoots()
    _resetPairedMobileDevicesCacheForTests()
    document.body.innerHTML = ''
  })

  it('refreshes paired devices from the backend after revoking one', async () => {
    mocks.listDevices
      .mockResolvedValueOnce({ devices: [pairedDevice('phone-1')] })
      .mockResolvedValueOnce({ devices: [pairedDevice('phone-2')] })
    mocks.revokeDevice.mockResolvedValue({ revoked: true })

    await renderMobilePane()

    await vi.waitFor(() =>
      expect(mocks.latestPairedDevicesProps?.devices.map((d) => d.deviceId)).toEqual(['phone-1'])
    )

    await act(async () => {
      mocks.latestPairedDevicesProps?.onRevokeDevice('phone-1')
    })

    await vi.waitFor(() => expect(mocks.revokeDevice).toHaveBeenCalledWith({ deviceId: 'phone-1' }))
    await vi.waitFor(() =>
      expect(mocks.latestPairedDevicesProps?.devices.map((d) => d.deviceId)).toEqual(['phone-2'])
    )
    // Positive control so the unmount test below can't stay green if the
    // success toast is ever dropped from the revoke path.
    await vi.waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1))
  })

  it('shows an error and keeps the device when revoke returns revoked:false', async () => {
    mocks.listDevices.mockResolvedValue({ devices: [pairedDevice('phone-1')] })
    mocks.revokeDevice.mockResolvedValue({ revoked: false })

    await renderMobilePane()

    await vi.waitFor(() =>
      expect(mocks.latestPairedDevicesProps?.devices.map((d) => d.deviceId)).toEqual(['phone-1'])
    )

    await act(async () => {
      mocks.latestPairedDevicesProps?.onRevokeDevice('phone-1')
    })

    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    // A revoke that did not happen must not fire a second (refresh) IPC call.
    expect(mocks.listDevices).toHaveBeenCalledTimes(1)
    expect(mocks.latestPairedDevicesProps?.devices.map((d) => d.deviceId)).toEqual(['phone-1'])
  })

  it('optimistically drops the revoked device when the post-revoke refresh fails', async () => {
    mocks.listDevices
      .mockResolvedValueOnce({ devices: [pairedDevice('phone-1'), pairedDevice('phone-2')] })
      .mockRejectedValueOnce(new Error('refresh failed'))
    mocks.revokeDevice.mockResolvedValue({ revoked: true })

    await renderMobilePane()

    await vi.waitFor(() =>
      expect(mocks.latestPairedDevicesProps?.devices.map((d) => d.deviceId)).toEqual([
        'phone-1',
        'phone-2'
      ])
    )

    await act(async () => {
      mocks.latestPairedDevicesProps?.onRevokeDevice('phone-1')
    })

    // Refresh rejected, so the fallback republishes the optimistic list without
    // the revoked device, and success is still reported.
    await vi.waitFor(() =>
      expect(mocks.latestPairedDevicesProps?.devices.map((d) => d.deviceId)).toEqual(['phone-2'])
    )
    await vi.waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1))
  })

  it('does not show revoke success after unmounting during the refresh', async () => {
    let resolveRefreshAfterRevoke: (value: { devices: [] }) => void = () => {}
    const refreshAfterRevoke = new Promise<{ devices: [] }>((resolve) => {
      resolveRefreshAfterRevoke = resolve
    })
    mocks.listDevices
      .mockResolvedValueOnce({ devices: [pairedDevice('phone-1')] })
      .mockReturnValueOnce(refreshAfterRevoke)
    mocks.revokeDevice.mockResolvedValue({ revoked: true })

    await renderMobilePane()

    await vi.waitFor(() =>
      expect(mocks.latestPairedDevicesProps?.devices.map((d) => d.deviceId)).toEqual(['phone-1'])
    )

    await act(async () => {
      mocks.latestPairedDevicesProps?.onRevokeDevice('phone-1')
    })

    await vi.waitFor(() => expect(mocks.listDevices).toHaveBeenCalledTimes(2))
    await unmountMobilePaneRoots()

    await act(async () => {
      resolveRefreshAfterRevoke({ devices: [] })
    })

    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
  it('applies private viewer generation and QR enlargement through the actual MobilePane owner', async () => {
    mocks.getPairingQR.mockResolvedValue({
      available: true,
      qrDataUrl: 'data:image/png;base64,qr',
      pairingUrl: 'private-viewer-pairing-canary',
      endpoint: 'ws://host'
    })
    await renderMobilePane()
    let generating
    await act(async () => {
      generating = applyMobileSettingsConnectionsViewerRequest({
        id: 'viewer-request',
        expiresAt: Date.now() + 500,
        command: { viewerId: 7, operation: 'mobile-settings.generate' }
      })
    })
    const result = await generating
    expect(result).toMatchObject({
      applied: true,
      persisted: null,
      state: { pairingAvailable: true, loading: false }
    })
    expect(JSON.stringify(result)).not.toContain('private-viewer-pairing-canary')
    expect(mocks.getPairingQR).toHaveBeenCalledTimes(1)
    let enlarging
    await act(async () => {
      enlarging = applyMobileSettingsConnectionsViewerRequest({
        id: 'viewer-request-2',
        expiresAt: Date.now() + 500,
        command: { viewerId: 7, operation: 'mobile-settings.qr-enlarge', open: true }
      })
    })
    expect(await enlarging).toMatchObject({ applied: true, state: { qrEnlarged: true } })
  })
  it('requires exact viewer revocation and observes the canonical refreshed device owner', async () => {
    mocks.listDevices
      .mockResolvedValueOnce({ devices: [pairedDevice('phone-1')] })
      .mockResolvedValueOnce({ devices: [] })
    mocks.revokeDevice.mockResolvedValue({ revoked: true })
    await renderMobilePane()
    await vi.waitFor(() => expect(mocks.latestPairedDevicesProps?.devices.length).toBe(1))
    await expect(
      applyMobileSettingsConnectionsViewerRequest({
        id: 'wrong',
        expiresAt: Date.now() + 500,
        command: {
          viewerId: 7,
          operation: 'mobile-settings.revoke',
          deviceId: 'phone-1',
          confirmTarget: 'phone-2'
        }
      })
    ).rejects.toThrow('confirm_target_mismatch')
    expect(mocks.revokeDevice).not.toHaveBeenCalled()
    let revoking
    await act(async () => {
      revoking = applyMobileSettingsConnectionsViewerRequest({
        id: 'exact',
        expiresAt: Date.now() + 500,
        command: {
          viewerId: 7,
          operation: 'mobile-settings.revoke',
          deviceId: 'phone-1',
          confirmTarget: 'phone-1'
        }
      })
    })
    expect(await revoking).toMatchObject({ applied: true, state: { deviceCount: 0 } })
    expect(mocks.revokeDevice).toHaveBeenCalledWith({ deviceId: 'phone-1' })
  })
  it('refuses a failed network refresh and does not confirm a mode whose profile write failed', async () => {
    await renderMobilePane()
    mocks.listNetworkInterfaces.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      await expect(
        applyMobileSettingsConnectionsViewerRequest({
          id: 'refresh',
          expiresAt: Date.now() + 500,
          command: { viewerId: 7, operation: 'mobile-settings.refresh' }
        })
      ).rejects.toThrow('network_refresh_failed')
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ...window.api,
        settings: { get: async () => ({ mobilePairingConnectionMode: 'automatic' }) }
      }
    })
    let switching
    await act(async () => {
      switching = applyMobileSettingsConnectionsViewerRequest({
        id: 'mode',
        expiresAt: Date.now() + 80,
        command: { viewerId: 7, operation: 'mobile-settings.mode', value: 'local-only' }
      })
    })
    expect(await switching).toMatchObject({
      applied: false,
      persisted: false,
      state: { connectionMode: 'local-only' }
    })
    expect(mocks.updateSettings).toHaveBeenCalledWith({ mobilePairingConnectionMode: 'local-only' })
  })
  it('reports an unconfirmed persistent auto-restore write as false when the owner value stays unchanged', async () => {
    await renderMobilePane()
    let updating
    await act(async () => {
      updating = applyMobileSettingsConnectionsViewerRequest({
        id: 'restore-failure',
        expiresAt: Date.now() + 50,
        command: { viewerId: 7, operation: 'mobile-settings.auto-restore', value: '60s' }
      })
    })
    expect(await updating).toMatchObject({
      applied: false,
      persisted: false,
      state: { autoRestoreFitMs: null }
    })
    expect(mocks.updateSettings).toHaveBeenCalledWith({ mobileAutoRestoreFitMs: 60000 })
  })
})
