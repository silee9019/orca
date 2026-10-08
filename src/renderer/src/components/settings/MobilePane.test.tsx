// @vitest-environment happy-dom
import { mocks } from './mobile-pane-test-fixture'
import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetPairedMobileDevicesCacheForTests } from '../mobile/paired-mobile-devices'
import { MobilePane } from './MobilePane'

describe('MobilePane pairing connection mode', () => {
  const getPairingQR = mocks.getPairingQR
  const updateSettings = mocks.updateSettings

  beforeEach(() => {
    vi.clearAllMocks()
    _resetPairedMobileDevicesCacheForTests()
    mocks.latestPairedDevicesProps = null
    getPairingQR.mockReset().mockResolvedValue({
      available: true,
      qrDataUrl: 'data:image/png;base64,qr',
      pairingUrl: 'orca://pair',
      endpoint: 'ws://host',
      connectionMode: 'automatic'
    })
    mocks.listDevices.mockReset().mockResolvedValue({ devices: [] })
    mocks.listNetworkInterfaces.mockReset().mockResolvedValue({ interfaces: [] })
    mocks.revokeDevice.mockReset().mockResolvedValue({ revoked: true })
    updateSettings.mockReset().mockResolvedValue(undefined)
    mocks.holder.state = {
      orcaProfileAuthStatus: { state: 'connected' },
      settingsSearchQuery: '',
      settings: { mobileAutoRestoreFitMs: null },
      updateSettings,
      recordFeatureInteraction: vi.fn(),
      fetchOrcaProfileAuthStatus: vi.fn().mockResolvedValue(null)
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        mobile: {
          getPairingQR,
          listDevices: mocks.listDevices,
          listNetworkInterfaces: mocks.listNetworkInterfaces,
          revokeDevice: mocks.revokeDevice
        },
        ui: { writeClipboardText: vi.fn().mockResolvedValue(undefined) }
      }
    })
  })

  afterEach(() => {
    cleanup()
    _resetPairedMobileDevicesCacheForTests()
    document.body.innerHTML = ''
  })

  it('defaults to Anywhere and issues an automatic QR when signed in', async () => {
    const user = userEvent.setup()
    render(<MobilePane />)
    expect(screen.getByTestId('mode')).toHaveTextContent('automatic')
    expect(screen.getByTestId('can-generate')).toHaveTextContent('true')

    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(getPairingQR).toHaveBeenCalledWith({ connectionMode: 'automatic' }))
  })

  it('keeps Anywhere selected but blocks generation when signed out', async () => {
    mocks.holder.state.orcaProfileAuthStatus = { state: 'local' }
    const user = userEvent.setup()
    render(<MobilePane />)
    expect(screen.getByTestId('mode')).toHaveTextContent('automatic')
    // Why: the signed-out desktop cannot serve Relay, so Generate is gated off
    // and no misleading local-only QR is minted under the Relay label.
    expect(screen.getByTestId('can-generate')).toHaveTextContent('false')
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(getPairingQR).not.toHaveBeenCalled()
  })

  it('surfaces Relay mint failure without a QR and offers Use LAN', async () => {
    getPairingQR.mockResolvedValue({
      available: false,
      reason: 'relay_mint_failed',
      guidance: 'Use LAN or retry',
      relayFailure: {
        code: 'relay offline',
        stage: 'create_pairing_relay',
        message: 'relay offline'
      }
    })
    const user = userEvent.setup()
    render(<MobilePane />)

    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() =>
      expect(screen.getByTestId('relay-mint-failure-notice')).toHaveTextContent(
        'Couldn’t create a Relay pairing code'
      )
    )
    expect(screen.getByTestId('qr')).toHaveTextContent('none')

    getPairingQR.mockResolvedValue({
      available: true,
      qrDataUrl: 'data:image/png;base64,local',
      pairingUrl: 'orca://pair#local',
      endpoint: 'ws://host',
      connectionMode: 'local-only'
    })
    await user.click(screen.getByRole('button', { name: 'Use LAN' }))
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('local-only'))
    await waitFor(() =>
      expect(screen.queryByTestId('relay-mint-failure-notice')).not.toBeInTheDocument()
    )
  })

  it('does not show mint failure after an honest Relay mint', async () => {
    const user = userEvent.setup()
    render(<MobilePane />)

    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent('base64,qr'))
    expect(screen.queryByTestId('relay-mint-failure-notice')).not.toBeInTheDocument()
  })

  it('keeps the copy fallback when QR encoding fails', async () => {
    getPairingQR.mockResolvedValue({
      available: true,
      qrDataUrl: null,
      qrError: 'encoding_failed',
      pairingUrl: 'orca://pair?code=copy-fallback',
      endpoint: 'wss://host.example/large',
      connectionMode: 'automatic'
    })
    const user = userEvent.setup()
    render(<MobilePane />)

    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(screen.getByTestId('qr-error')).toHaveTextContent('true'))
    expect(screen.getByTestId('qr')).toHaveTextContent('none')
    expect(screen.getByTestId('pairing-url')).toHaveTextContent('copy-fallback')
  })

  it('persists the chosen path when the mode changes', async () => {
    const user = userEvent.setup()
    render(<MobilePane />)
    await user.click(screen.getByRole('button', { name: 'choose-local' }))
    expect(updateSettings).toHaveBeenCalledWith({ mobilePairingConnectionMode: 'local-only' })
    expect(screen.getByTestId('mode')).toHaveTextContent('local-only')
    expect(getPairingQR).not.toHaveBeenCalled()
  })

  it('disables Relay recovery while a retry is in flight', async () => {
    getPairingQR.mockResolvedValueOnce({
      available: false,
      reason: 'relay_mint_failed',
      relayFailure: {
        code: 'relay_mint_failed',
        stage: 'create_pairing_relay',
        message: 'Relay pairing invite request failed'
      }
    })
    const user = userEvent.setup()
    render(<MobilePane />)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await screen.findByTestId('relay-mint-failure-notice')

    let resolveRetry: ((value: Record<string, unknown>) => void) | undefined
    getPairingQR.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve
        })
    )
    await user.click(screen.getByRole('button', { name: 'Retry Relay' }))
    expect(screen.getByRole('button', { name: 'Retry Relay' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use LAN' })).toBeEnabled()
    await user.dblClick(screen.getByRole('button', { name: 'Retry Relay' }))
    expect(getPairingQR).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.getByRole('button', { name: /Retrying/ })).toBeDisabled())

    resolveRetry?.({
      available: true,
      qrDataUrl: 'data:image/png;base64,relay',
      pairingUrl: 'orca://relay',
      endpoint: 'ws://relay',
      connectionMode: 'automatic'
    })
    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent('base64,relay'))
    expect(screen.getByRole('status')).toHaveTextContent('Pairing code ready')
  })

  it('lets LAN recover immediately while a Relay retry is unresolved', async () => {
    mocks.listNetworkInterfaces.mockResolvedValue({
      interfaces: [{ name: 'Ethernet', address: '10.0.0.2' }]
    })
    getPairingQR.mockResolvedValueOnce({
      available: false,
      reason: 'relay_mint_failed',
      relayFailure: {
        code: 'relay_mint_failed',
        stage: 'create_pairing_relay',
        message: 'Relay pairing invite request failed'
      }
    })
    const user = userEvent.setup()
    render(<MobilePane />)
    await waitFor(() => expect(mocks.listNetworkInterfaces).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await screen.findByTestId('relay-mint-failure-notice')

    let resolveRetry: ((value: Record<string, unknown>) => void) | undefined
    getPairingQR.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve
        })
    )
    getPairingQR.mockResolvedValueOnce({
      available: true,
      qrDataUrl: 'data:image/png;base64,local',
      pairingUrl: 'orca://local',
      endpoint: 'ws://10.0.0.2',
      connectionMode: 'local-only'
    })
    await user.click(screen.getByRole('button', { name: 'Retry Relay' }))
    await user.click(screen.getByRole('button', { name: 'Use LAN' }))

    await waitFor(() =>
      expect(getPairingQR).toHaveBeenLastCalledWith({
        address: '10.0.0.2',
        connectionMode: 'local-only'
      })
    )
    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent('base64,local'))
    act(() => {
      resolveRetry?.({
        available: true,
        qrDataUrl: 'data:image/png;base64,stale-relay',
        pairingUrl: 'orca://stale-relay',
        endpoint: 'ws://relay',
        connectionMode: 'automatic'
      })
    })
    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent('base64,local'))
    expect(screen.getByTestId('mode')).toHaveTextContent('local-only')
  })

  it('restores a saved local-only preference without user interaction', () => {
    mocks.holder.state.settings = {
      mobileAutoRestoreFitMs: null,
      mobilePairingConnectionMode: 'local-only'
    }
    render(<MobilePane />)
    expect(screen.getByTestId('mode')).toHaveTextContent('local-only')
  })

  it('restores a saved custom address for future pairing codes', async () => {
    mocks.holder.state.settings = {
      mobileAutoRestoreFitMs: null,
      mobilePairingCustomAddress: '100.126.117.25:6768'
    }
    mocks.listNetworkInterfaces.mockResolvedValue({
      interfaces: [{ name: 'Ethernet', address: '10.0.0.2' }]
    })
    const user = userEvent.setup()
    render(<MobilePane />)

    await waitFor(() =>
      expect(screen.getByTestId('selected-address')).toHaveTextContent('100.126.117.25:6768')
    )
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() =>
      expect(getPairingQR).toHaveBeenCalledWith({
        address: '100.126.117.25:6768',
        connectionMode: 'automatic'
      })
    )
  })

  it('persists a custom address and clears it when a discovered address is selected', async () => {
    mocks.listNetworkInterfaces.mockResolvedValue({
      interfaces: [{ name: 'Ethernet', address: '10.0.0.2' }]
    })
    const user = userEvent.setup()
    render(<MobilePane />)
    await waitFor(() => expect(mocks.listNetworkInterfaces).toHaveBeenCalledOnce())

    await user.click(screen.getByRole('button', { name: 'choose-custom-address' }))
    expect(updateSettings).toHaveBeenCalledWith({
      mobilePairingCustomAddress: '100.126.117.25:6768',
      mobilePairingCustomAddresses: ['100.126.117.25:6768']
    })
    expect(screen.getByTestId('selected-address')).toHaveTextContent('100.126.117.25:6768')
    expect(screen.getByTestId('selected-address-is-custom')).toHaveTextContent('true')
    expect(screen.getByTestId('custom-addresses')).toHaveTextContent('100.126.117.25:6768')

    await user.click(screen.getByRole('button', { name: 'choose-discovered-address' }))
    expect(updateSettings).toHaveBeenCalledWith({ mobilePairingCustomAddress: null })
    expect(screen.getByTestId('selected-address')).toHaveTextContent('10.0.0.2')
    expect(screen.getByTestId('custom-addresses')).toHaveTextContent('100.126.117.25:6768')
  })

  it('keeps the current pairing code when the active custom address is reselected', async () => {
    const customAddress = '100.126.117.25:6768'
    mocks.holder.state.settings = {
      mobileAutoRestoreFitMs: null,
      mobilePairingCustomAddress: customAddress,
      mobilePairingCustomAddresses: [customAddress]
    }
    const user = userEvent.setup()
    render(<MobilePane />)

    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent('base64,qr'))
    getPairingQR.mockClear()
    updateSettings.mockClear()

    await user.click(screen.getByRole('button', { name: 'choose-custom-address' }))

    expect(updateSettings).not.toHaveBeenCalled()
    expect(getPairingQR).not.toHaveBeenCalled()
    expect(screen.getByTestId('qr')).toHaveTextContent('base64,qr')
  })

  it('keeps the firewall notice on Relay, which still uses the direct LAN path', async () => {
    const user = userEvent.setup()
    render(<MobilePane />)

    expect(screen.getByTestId('mode')).toHaveTextContent('automatic')
    expect(screen.getByTestId('firewall-notice')).toHaveTextContent('true')

    await user.click(screen.getByRole('button', { name: 'choose-local' }))
    expect(screen.getByTestId('firewall-notice')).toHaveTextContent('false')
  })

  it('keeps the current pairing code when only custom address intent changes', async () => {
    const address = '100.126.117.25:6768'
    mocks.holder.state.settings = {
      mobileAutoRestoreFitMs: null,
      mobilePairingCustomAddress: address,
      mobilePairingCustomAddresses: [address]
    }
    mocks.listNetworkInterfaces.mockResolvedValue({
      interfaces: [{ name: 'Tailscale', address }]
    })
    const user = userEvent.setup()
    render(<MobilePane />)
    await waitFor(() => expect(mocks.listNetworkInterfaces).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent('base64,qr'))
    getPairingQR.mockClear()
    updateSettings.mockClear()

    await user.click(screen.getByRole('button', { name: 'choose-discovered-address' }))

    expect(updateSettings).toHaveBeenCalledWith({ mobilePairingCustomAddress: null })
    expect(getPairingQR).not.toHaveBeenCalled()
    expect(screen.getByTestId('qr')).toHaveTextContent('base64,qr')
    expect(screen.getByTestId('selected-address-is-custom')).toHaveTextContent('false')

    updateSettings.mockClear()
    await user.click(screen.getByRole('button', { name: 'choose-custom-address' }))
    expect(updateSettings).toHaveBeenCalledWith({
      mobilePairingCustomAddress: address,
      mobilePairingCustomAddresses: [address]
    })
    updateSettings.mockClear()
    await user.click(screen.getByRole('button', { name: 'remove-custom-address' }))

    expect(updateSettings).toHaveBeenCalledWith({
      mobilePairingCustomAddress: null,
      mobilePairingCustomAddresses: []
    })
    expect(getPairingQR).not.toHaveBeenCalled()
    expect(screen.getByTestId('qr')).toHaveTextContent('base64,qr')
    expect(screen.getByTestId('selected-address-is-custom')).toHaveTextContent('false')
  })

  it('removes the selected custom address and falls back to discovery', async () => {
    const customAddress = '100.126.117.25:6768'
    mocks.holder.state.settings = {
      mobileAutoRestoreFitMs: null,
      mobilePairingCustomAddress: customAddress,
      mobilePairingCustomAddresses: [customAddress, 'second.example:6768']
    }
    mocks.listNetworkInterfaces.mockResolvedValue({
      interfaces: [{ name: 'Ethernet', address: '10.0.0.2' }]
    })
    const user = userEvent.setup()
    render(<MobilePane />)
    await waitFor(() =>
      expect(screen.getByTestId('selected-address')).toHaveTextContent(customAddress)
    )

    await user.click(screen.getByRole('button', { name: 'remove-custom-address' }))

    expect(updateSettings).toHaveBeenCalledWith({
      mobilePairingCustomAddress: null,
      mobilePairingCustomAddresses: ['second.example:6768']
    })
    expect(screen.getByTestId('selected-address')).toHaveTextContent('10.0.0.2')
    expect(screen.getByTestId('selected-address-is-custom')).toHaveTextContent('false')
  })

  it('removes an inactive custom address without changing the selection', async () => {
    mocks.holder.state.settings = {
      mobileAutoRestoreFitMs: null,
      mobilePairingCustomAddress: 'second.example:6768',
      mobilePairingCustomAddresses: ['100.126.117.25:6768', 'second.example:6768']
    }
    const user = userEvent.setup()
    render(<MobilePane />)

    await user.click(screen.getByRole('button', { name: 'remove-custom-address' }))

    expect(updateSettings).toHaveBeenCalledWith({
      mobilePairingCustomAddresses: ['second.example:6768']
    })
    expect(screen.getByTestId('selected-address')).toHaveTextContent('second.example:6768')
    expect(screen.getByTestId('selected-address-is-custom')).toHaveTextContent('true')
  })

  it('keeps a saved custom override when discovery later stops listing it', async () => {
    const customAddress = '100.126.117.25:6768'
    mocks.holder.state.settings = {
      mobileAutoRestoreFitMs: null,
      mobilePairingCustomAddress: customAddress
    }
    mocks.listNetworkInterfaces.mockResolvedValueOnce({
      interfaces: [{ name: 'Tailscale', address: customAddress }]
    })
    const user = userEvent.setup()
    render(<MobilePane />)
    await waitFor(() =>
      expect(screen.getByTestId('selected-address')).toHaveTextContent(customAddress)
    )

    let resolveRefresh: ((value: Record<string, unknown>) => void) | undefined
    mocks.listNetworkInterfaces.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve
        })
    )
    await user.click(screen.getByRole('button', { name: 'refresh-addresses' }))
    expect(screen.getByTestId('refreshing-addresses')).toHaveTextContent('true')

    resolveRefresh?.({ interfaces: [{ name: 'Ethernet', address: '10.0.0.2' }] })
    await waitFor(() =>
      expect(screen.getByTestId('refreshing-addresses')).toHaveTextContent('false')
    )

    expect(screen.getByTestId('selected-address')).toHaveTextContent(customAddress)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('discards a Relay QR that resolves after signing out mid-generate', async () => {
    const user = userEvent.setup()
    let resolveQr: ((value: Record<string, unknown>) => void) | undefined
    getPairingQR.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQr = resolve
        })
    )
    const { rerender } = render(<MobilePane />)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(getPairingQR).toHaveBeenCalledWith({ connectionMode: 'automatic' }))

    // Sign out while the Relay mint is still in flight.
    mocks.holder.state.orcaProfileAuthStatus = { state: 'local' }
    rerender(<MobilePane />)

    // The superseded response arrives; it must not paint a QR on a desktop that
    // can no longer serve Relay.
    resolveQr?.({
      available: true,
      qrDataUrl: 'data:image/png;base64,relay',
      pairingUrl: 'orca://relay',
      endpoint: 'ws://relay'
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.getByTestId('qr')).toHaveTextContent('none')
  })

  it('drops loading and re-enables Generate after signing out mid-generate', async () => {
    const user = userEvent.setup()
    let resolveQr: ((value: Record<string, unknown>) => void) | undefined
    getPairingQR.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQr = resolve
        })
    )
    const { rerender } = render(<MobilePane />)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(getPairingQR).toHaveBeenCalledWith({ connectionMode: 'automatic' }))
    // The hung generate holds the spinner up.
    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    // Sign out while the Relay mint is still in flight; the superseded request
    // must drop loading so Generate isn't wedged disabled forever.
    mocks.holder.state.orcaProfileAuthStatus = { state: 'local' }
    rerender(<MobilePane />)
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    // The late response resolves but must not resurrect the spinner.
    resolveQr?.({
      available: true,
      qrDataUrl: 'data:image/png;base64,relay',
      pairingUrl: 'orca://relay',
      endpoint: 'ws://relay'
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.getByTestId('loading')).toHaveTextContent('false')

    // Switching to LAN re-enables Generate (no signed-in gate).
    await user.click(screen.getByRole('button', { name: 'choose-local' }))
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  })

  it('drops loading after switching path mid-generate', async () => {
    const user = userEvent.setup()
    getPairingQR.mockImplementationOnce(() => new Promise(() => {}))
    render(<MobilePane />)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(getPairingQR).toHaveBeenCalledWith({ connectionMode: 'automatic' }))
    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    // Switch to LAN before the mint resolves; loading must clear so
    // Generate can be used again for the new path.
    await user.click(screen.getByRole('button', { name: 'choose-local' }))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  })

  it('clears a shown QR when another window changes the saved path', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MobilePane />)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent('base64,qr'))

    // Another window persists a new path; the shared hook syncs it in without
    // routing through changeConnectionMode.
    mocks.holder.state.settings = {
      mobileAutoRestoreFitMs: null,
      mobilePairingConnectionMode: 'local-only'
    }
    rerender(<MobilePane />)

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('local-only'))
    expect(screen.getByTestId('qr')).toHaveTextContent('none')
  })

  it('discards a Relay QR that resolves after switching path mid-generate', async () => {
    const user = userEvent.setup()
    let resolveQr: ((value: Record<string, unknown>) => void) | undefined
    getPairingQR.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQr = resolve
        })
    )
    render(<MobilePane />)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(getPairingQR).toHaveBeenCalledWith({ connectionMode: 'automatic' }))

    // Switch to LAN before the Relay mint resolves — LAN may auto-mint a new code.
    getPairingQR.mockResolvedValue({
      available: true,
      qrDataUrl: 'data:image/png;base64,local',
      pairingUrl: 'orca://pair#local',
      endpoint: 'ws://host',
      connectionMode: 'local-only'
    })
    await user.click(screen.getByRole('button', { name: 'choose-local' }))

    resolveQr?.({
      available: true,
      qrDataUrl: 'data:image/png;base64,relay',
      pairingUrl: 'orca://relay',
      endpoint: 'ws://relay',
      connectionMode: 'automatic'
    })
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('local-only'))
    await waitFor(() =>
      expect(screen.getByTestId('pairing-url')).not.toHaveTextContent('orca://relay')
    )
  })
})
