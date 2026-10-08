// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { RuntimePairingUrlGenerator } from './RuntimePairingUrlGenerator'
import { runtimePairingLinkCache } from './runtime-pairing-link-state'
import { applyRuntimeLinkViewerRequest } from '../../runtime/runtime-link-viewer'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
const network = vi.fn()
const grants = vi.fn()
const generate = vi.fn()
const revoke = vi.fn()
const clipboard = vi.fn()
async function command(command: ConnectionsViewerCommand) {
  let result!: ReturnType<typeof applyRuntimeLinkViewerRequest>
  await act(async () => {
    result = applyRuntimeLinkViewerRequest({
      id: 'runtime-link-test',
      expiresAt: Date.now() + 1000,
      command
    })
    void result.catch(() => {})
  })
  let settled = false
  result
    .finally(() => {
      settled = true
    })
    .catch(() => {})
  while (!settled) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  return result
}
function mount(form = true) {
  return render(
    <TooltipProvider>
      <RuntimePairingUrlGenerator showGeneratorForm={form} />
    </TooltipProvider>
  )
}
beforeEach(() => {
  Object.assign(runtimePairingLinkCache, {
    selectedAddress: '192.0.2.1',
    customAddress: '',
    intent: 'another',
    generatedAddress: null,
    runtimePairingUrl: null,
    webClientUrl: null,
    runtimePairingDeviceId: null
  })
  network
    .mockReset()
    .mockImplementation(async () => ({ interfaces: [{ name: 'test', address: '192.0.2.1' }] }))
  grants.mockReset().mockImplementation(async () => ({ grants: [] }))
  generate.mockReset().mockResolvedValue({
    available: true,
    pairingUrl: 'orca://pair#private',
    webClientUrl: 'https://private.test/?token=secret',
    endpoint: 'ws://private.test',
    deviceId: 'grant-1'
  })
  revoke.mockReset().mockResolvedValue({ revoked: true })
  clipboard.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { writeClipboardText: clipboard },
      mobile: {
        listNetworkInterfaces: network,
        listRuntimeAccessGrants: grants,
        getRuntimePairingUrl: generate,
        revokeRuntimeAccess: revoke
      }
    }
  })
})
afterEach(cleanup)
it('uses the real form callbacks for intent and private address drafts', async () => {
  mount()
  await waitFor(() => expect(network).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('radio', { name: /Custom address/ }))
  fireEvent.change(screen.getByLabelText('Custom connection address'), {
    target: { value: 'native.example.test' }
  })
  expect(runtimePairingLinkCache.selectedAddress).toBe('native.example.test')
  expect(
    await command({ operation: 'runtime-link.address', viewerId: 1, value: 'private.example.test' })
  ).toMatchObject({ applied: true, persisted: null, state: { intent: 'custom', addressSet: true } })
  expect(screen.getByLabelText('Custom connection address')).toHaveValue('private.example.test')
  const result = await command({ operation: 'runtime-link.intent', viewerId: 1, value: 'local' })
  expect(result).toMatchObject({ applied: true, state: { intent: 'local' } })
  expect(JSON.stringify(result)).not.toContain('private.example.test')
  expect(
    await command({ operation: 'runtime-link.address', viewerId: 1, value: 'ignored.test' })
  ).toMatchObject({ applied: false })
})
it('refreshes canonical provider arrays and reports failure without an acknowledgement', async () => {
  mount()
  await waitFor(() => expect(grants).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Refresh shared access' }))
  await waitFor(() => expect(grants).toHaveBeenCalledTimes(2))
  expect(
    await command({ operation: 'runtime-link.refresh', viewerId: 1, target: 'network' })
  ).toMatchObject({ applied: true, state: { refreshing: false } })
  expect(
    await command({ operation: 'runtime-link.refresh', viewerId: 1, target: 'grants' })
  ).toMatchObject({ applied: true, state: { grantsLoading: false } })
  network.mockRejectedValueOnce(new Error('private-error'))
  const result = await command({
    operation: 'runtime-link.refresh',
    viewerId: 1,
    target: 'network'
  })
  expect(result).toMatchObject({ applied: false })
  expect(JSON.stringify(result)).not.toContain('private-error')
})
it('rejects hidden and duplicate form owners', async () => {
  mount(false)
  await expect(
    command({ operation: 'runtime-link.intent', viewerId: 1, value: 'custom' })
  ).rejects.toThrow('connections_surface_unavailable')
  mount()
  await expect(command({ operation: 'runtime-link.get', viewerId: 1 })).rejects.toThrow(
    'connections_viewer_ambiguous'
  )
})
it('does not acknowledge refresh after its owner unmounts', async () => {
  const view = mount()
  await waitFor(() => expect(network).toHaveBeenCalledOnce())
  let resolve!: (value: { interfaces: { name: string; address: string }[] }) => void
  network.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  const pending = applyRuntimeLinkViewerRequest({
    id: 'late',
    expiresAt: Date.now() + 1000,
    command: { operation: 'runtime-link.refresh', viewerId: 1, target: 'network' }
  })
  const rejected = expect(pending).rejects.toThrow('request_expired')
  view.unmount()
  resolve({ interfaces: [] })
  await rejected
})

it('generates through the native form and typed command, then copies both private links', async () => {
  mount()
  await waitFor(() => expect(network).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Generate Access Link' }))
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Copy {{value0}}' })).toHaveLength(2)
  )
  expect(generate).toHaveBeenLastCalledWith({
    address: '192.0.2.1',
    rotate: true,
    reach: 'network'
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'Copy {{value0}}' })[0])
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith('https://private.test/?token=secret'))
  const result = await command({
    operation: 'runtime-link.generate',
    viewerId: 1,
    address: '192.0.2.1',
    intent: 'another'
  })
  expect(result).toEqual(
    expect.objectContaining({
      applied: true,
      state: expect.objectContaining({ current: true, generating: false })
    })
  )
  expect(
    await command({ operation: 'runtime-link.copy', viewerId: 1, target: 'pairing' })
  ).toMatchObject({ applied: true, state: { copiedTarget: 'pairing' } })
  expect(
    await command({ operation: 'runtime-link.copy', viewerId: 1, target: 'web' })
  ).toMatchObject({ applied: true, state: { copiedTarget: 'web' } })
  expect(clipboard).toHaveBeenCalledWith('orca://pair#private')
  expect(JSON.stringify(result)).not.toMatch(/secret|private|grant-1/)
  expect(
    await command({
      operation: 'runtime-link.generate',
      viewerId: 1,
      address: 'wrong.test',
      intent: 'another'
    })
  ).toMatchObject({ applied: false })
  await command({ operation: 'runtime-link.intent', viewerId: 1, value: 'custom' })
  await command({ operation: 'runtime-link.address', viewerId: 1, value: 'changed.test' })
  expect(
    await command({ operation: 'runtime-link.copy', viewerId: 1, target: 'web' })
  ).toMatchObject({ applied: false })
})
it('requires canonical grant absence after native or typed revocation', async () => {
  const grant = { deviceId: 'grant-1', name: 'Private grant', createdAt: 1, lastSeenAt: null }
  grants.mockResolvedValue({ grants: [grant] })
  mount()
  await screen.findByText('Private grant')
  expect(
    await command({ operation: 'runtime-link.revoke', viewerId: 1, deviceId: 'unknown' })
  ).toMatchObject({ applied: false })
  expect(revoke).not.toHaveBeenCalled()
  expect(
    await command({ operation: 'runtime-link.revoke', viewerId: 1, deviceId: 'grant-1' })
  ).toMatchObject({ applied: false, state: { grantCount: 1 } })
  grants.mockResolvedValue({ grants: [] })
  fireEvent.click(screen.getByRole('button', { name: 'Revoke {{value0}}' }))
  await waitFor(() => expect(screen.queryByText('Private grant')).not.toBeInTheDocument())
  grants.mockResolvedValue({ grants: [grant] })
  await command({ operation: 'runtime-link.refresh', viewerId: 1, target: 'grants' })
  grants.mockResolvedValue({ grants: [] })
  expect(
    await command({ operation: 'runtime-link.revoke', viewerId: 1, deviceId: 'grant-1' })
  ).toMatchObject({ applied: true, state: { grantCount: 0 } })
})
it('blocks duplicate generation and late cache writes after unmount', async () => {
  const view = mount()
  await waitFor(() => expect(network).toHaveBeenCalledOnce())
  let resolve!: (value: {
    available: true
    pairingUrl: string
    webClientUrl: string
    endpoint: string
    deviceId: string
  }) => void
  generate.mockReturnValue(
    new Promise((done) => {
      resolve = done
    })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Generate Access Link' }))
  expect(
    await command({
      operation: 'runtime-link.generate',
      viewerId: 1,
      address: '192.0.2.1',
      intent: 'another'
    })
  ).toMatchObject({ applied: false })
  expect(generate).toHaveBeenCalledOnce()
  view.unmount()
  await act(async () => {
    resolve({
      available: true,
      pairingUrl: 'late-secret',
      webClientUrl: 'late-secret',
      endpoint: 'late',
      deviceId: 'late'
    })
  })
  expect(runtimePairingLinkCache.runtimePairingUrl).toBeNull()
})
it('reuses the actual detected-address picker callback', async () => {
  network.mockResolvedValue({
    interfaces: [
      { name: 'first', address: '192.0.2.1' },
      { name: 'second', address: '192.0.2.2' }
    ]
  })
  mount()
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('first'))
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: /second/ }))
  expect(runtimePairingLinkCache.selectedAddress).toBe('192.0.2.2')
  expect(
    await command({ operation: 'runtime-link.address', viewerId: 1, value: '192.0.2.1' })
  ).toMatchObject({ applied: true })
  expect(screen.getByRole('combobox')).toHaveTextContent('first')
})
it('reports unavailable generation and failed clipboard writes without success', async () => {
  mount()
  await waitFor(() => expect(network).toHaveBeenCalledOnce())
  generate.mockResolvedValueOnce({ available: false })
  expect(
    await command({
      operation: 'runtime-link.generate',
      viewerId: 1,
      address: '192.0.2.1',
      intent: 'another'
    })
  ).toMatchObject({ applied: false })
  await command({
    operation: 'runtime-link.generate',
    viewerId: 1,
    address: '192.0.2.1',
    intent: 'another'
  })
  clipboard.mockRejectedValueOnce(new Error('clipboard-private-error'))
  expect(
    await command({ operation: 'runtime-link.copy', viewerId: 1, target: 'web' })
  ).toMatchObject({ applied: false })
})
