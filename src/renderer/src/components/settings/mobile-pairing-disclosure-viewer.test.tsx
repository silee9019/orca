// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MobilePairingSetupSection } from './MobilePairingSetupSection'
import { TooltipProvider } from '../ui/tooltip'
import { applyPairingSetupConnectionsViewerRequest } from '@/runtime/pairing-setup-connections-viewer-controller'

function mount(
  overrides: {
    connectionMode?: 'automatic' | 'local-only'
    addressDisclosureForcedOpen?: boolean
    selectedAddressIsCustom?: boolean
  } = {}
) {
  return render(
    <TooltipProvider>
      <MobilePairingSetupSection
        connectionMode="automatic"
        connectionPathControl={null}
        networkInterfaces={[]}
        customAddresses={[]}
        selectedAddress="private-address-canary"
        selectedAddressIsCustom={false}
        onSelectedAddressChange={vi.fn()}
        onCustomAddressSelect={vi.fn()}
        onCustomAddressRemove={vi.fn()}
        refreshingNetworkInterfaces={false}
        onRefreshNetworkInterfaces={vi.fn()}
        loading={false}
        hasQrCode={false}
        onGenerateQr={vi.fn()}
        {...overrides}
      />
    </TooltipProvider>
  )
}
function request(open: boolean, expiresAt = Date.now() + 1000) {
  return {
    id: 'fixture',
    expiresAt,
    command: { viewerId: 7, operation: 'pairing-setup.disclosure' as const, open }
  }
}
async function invoke(open: boolean) {
  let applying: ReturnType<typeof applyPairingSetupConnectionsViewerRequest> | undefined
  await act(async () => {
    applying = applyPairingSetupConnectionsViewerRequest(request(open))
    void applying.catch(() => {})
  })
  if (!applying) {
    throw new Error('fixture_request_missing')
  }
  return applying
}
afterEach(cleanup)
it('opens and closes the actual disclosure with committed readback and no private address output', async () => {
  mount()
  expect(screen.queryByRole('combobox')).toBeNull()
  const opened = await invoke(true)
  expect(opened).toMatchObject({
    applied: true,
    persisted: null,
    state: { open: true, pinned: false, usingRelay: true }
  })
  expect(screen.getByRole('combobox')).toBeVisible()
  expect(JSON.stringify(opened)).not.toContain('private-address-canary')
  const closed = await invoke(false)
  expect(closed.applied).toBe(true)
  expect(screen.queryByRole('combobox')).toBeNull()
})
it.each([
  { addressDisclosureForcedOpen: true },
  { selectedAddressIsCustom: true },
  { connectionMode: 'local-only' as const }
])('refuses closing an address picker held open by its actual parent policy: %j', async (props) => {
  mount(props)
  expect(screen.getByRole('combobox')).toBeVisible()
  await expect(applyPairingSetupConnectionsViewerRequest(request(false))).rejects.toThrow(
    'address_disclosure_required'
  )
  expect(screen.getByRole('combobox')).toBeVisible()
})
it('does not apply an expired request and removes the controller on unmount', async () => {
  const section = mount()
  await expect(
    applyPairingSetupConnectionsViewerRequest(request(true, Date.now() - 1))
  ).rejects.toThrow('request_expired')
  expect(screen.queryByRole('combobox')).toBeNull()
  section.unmount()
  await expect(applyPairingSetupConnectionsViewerRequest(request(true))).rejects.toThrow(
    'connections_surface_unavailable'
  )
})

it('keeps multiple sections mounted but refuses an ambiguous viewer request', async () => {
  const first = mount()
  mount()
  await expect(applyPairingSetupConnectionsViewerRequest(request(true))).rejects.toThrow(
    'connections_viewer_ambiguous'
  )
  first.unmount()
  expect((await invoke(true)).applied).toBe(true)
})
