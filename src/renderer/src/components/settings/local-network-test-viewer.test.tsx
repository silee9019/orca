// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalNetworkConnectionTestResult } from '../../../../shared/developer-permissions-types'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import { LocalNetworkConnectionTest } from './LocalNetworkConnectionTest'
import { loadLocalNetworkConnectionSuccess } from './local-network-connection-history'
import { applyLocalNetworkTestViewerRequest } from '@/runtime/local-network-test-viewer'
const test =
  vi.fn<(args: { host: string; port: number }) => Promise<LocalNetworkConnectionTestResult>>()
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applyLocalNetworkTestViewerRequest> | undefined
  await act(async () => {
    pending = applyLocalNetworkTestViewerRequest({
      id: 'local-test',
      expiresAt: Date.now() + 400,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
async function draft(host = 'devbox.local', port = '3000') {
  await invoke({ viewerId: 7, operation: 'local-network-test.disclosure', open: true })
  await invoke({ viewerId: 7, operation: 'local-network-test.host', value: host })
  await invoke({ viewerId: 7, operation: 'local-network-test.port', value: port })
}
beforeEach(() => {
  localStorage.clear()
  test.mockReset().mockImplementation(async (args) => ({ ok: true, ...args, testedAt: 1000 }))
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { developerPermissions: { testLocalNetworkConnection: test } }
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})
it('pairs native form inputs/submit with typed exact target and canonical history', async () => {
  render(<LocalNetworkConnectionTest />)
  fireEvent.click(screen.getByRole('button', { name: /^Test connection/ }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Host' }), {
    target: { value: 'native.local' }
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Port' }), { target: { value: '3000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
  await waitFor(() => expect(screen.getByText(/native.local:3000/)).toBeInTheDocument())
  expect(loadLocalNetworkConnectionSuccess()).toEqual({
    host: 'native.local',
    port: 3000,
    testedAt: 1000
  })
  await draft('typed-private-host-canary.local', '03000')
  const result = await invoke({
    viewerId: 7,
    operation: 'local-network-test.submit',
    host: 'typed-private-host-canary.local',
    port: 3000
  })
  expect(result).toMatchObject({
    applied: true,
    persisted: true,
    state: { hasSuccess: true, failure: null, running: false }
  })
  expect(JSON.stringify(result)).not.toContain('typed-private-host-canary')
  expect(loadLocalNetworkConnectionSuccess()?.host).toBe('typed-private-host-canary.local')
  await expect(
    invoke({ viewerId: 7, operation: 'local-network-test.disclosure', open: false })
  ).resolves.toMatchObject({ applied: true, state: { open: false } })
})
it('keeps successful history on a failed test and reports unsupported/failed results without raw errors', async () => {
  render(<LocalNetworkConnectionTest />)
  await draft()
  await invoke({
    viewerId: 7,
    operation: 'local-network-test.submit',
    host: 'devbox.local',
    port: 3000
  })
  const saved = loadLocalNetworkConnectionSuccess()
  test.mockResolvedValueOnce({
    ok: false,
    host: 'devbox.local',
    port: 3000,
    testedAt: 2000,
    failure: 'unsupported'
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'local-network-test.submit',
      host: 'devbox.local',
      port: 3000
    })
  ).resolves.toMatchObject({
    applied: true,
    persisted: null,
    state: { failure: 'unsupported', hasSuccess: true }
  })
  expect(loadLocalNetworkConnectionSuccess()).toEqual(saved)
  test.mockRejectedValueOnce(new Error('private-test-canary'))
  const result = await invoke({
    viewerId: 7,
    operation: 'local-network-test.submit',
    host: 'devbox.local',
    port: 3000
  })
  expect(result).toMatchObject({
    applied: false,
    persisted: null,
    state: { failure: 'failed', hasSuccess: true }
  })
  expect(JSON.stringify(result)).not.toContain('private-test-canary')
})
it('distinguishes useful live success from failed history persistence', async () => {
  render(<LocalNetworkConnectionTest />)
  await draft()
  vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
    throw new Error('private-storage-canary')
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'local-network-test.submit',
      host: 'devbox.local',
      port: 3000
    })
  ).resolves.toMatchObject({ applied: true, persisted: false, state: { hasSuccess: true } })
  expect(loadLocalNetworkConnectionSuccess()).toBeNull()
  expect(screen.getByText(/devbox.local:3000/)).toBeInTheDocument()
})
it('pins the current target and shares disabled/busy native and typed guards', async () => {
  render(<LocalNetworkConnectionTest />)
  await draft()
  await expect(
    invoke({ viewerId: 7, operation: 'local-network-test.port', value: 'not-a-number' })
  ).resolves.toMatchObject({ applied: false })
  await expect(
    invoke({ viewerId: 7, operation: 'local-network-test.submit', host: 'other.local', port: 3000 })
  ).rejects.toThrow('local_network_target_mismatch')
  expect(test).not.toHaveBeenCalled()
  let finish: ((result: LocalNetworkConnectionTestResult) => void) | undefined
  test.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = invoke({
    viewerId: 7,
    operation: 'local-network-test.submit',
    host: 'devbox.local',
    port: 3000
  })
  await waitFor(() => expect(test).toHaveBeenCalledOnce())
  const host = screen.getByRole('textbox', { name: 'Host' })
  expect(host).toBeDisabled()
  fireEvent.change(host, { target: { value: 'stale-native.local' } })
  await expect(
    invoke({ viewerId: 7, operation: 'local-network-test.host', value: 'stale-typed.local' })
  ).resolves.toMatchObject({ applied: false })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'local-network-test.submit',
      host: 'devbox.local',
      port: 3000
    })
  ).resolves.toMatchObject({ applied: false })
  expect(test).toHaveBeenCalledOnce()
  await act(async () => {
    finish?.({ ok: true, host: 'devbox.local', port: 3000, testedAt: 1000 })
  })
  await expect(pending).resolves.toMatchObject({ applied: true, persisted: true })
  expect(host).toHaveValue('devbox.local')
})
it('does not save a late success after unmount or mutate duplicate/hidden forms', async () => {
  render(<LocalNetworkConnectionTest />)
  await expect(
    invoke({ viewerId: 7, operation: 'local-network-test.host', value: 'hidden.local' })
  ).rejects.toThrow('connections_surface_unavailable')
  await draft()
  let finish: ((result: LocalNetworkConnectionTestResult) => void) | undefined
  test.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = invoke({
    viewerId: 7,
    operation: 'local-network-test.submit',
    host: 'devbox.local',
    port: 3000
  })
  void pending.catch(() => {})
  await waitFor(() => expect(test).toHaveBeenCalledOnce())
  await act(async () => {
    cleanup()
    finish?.({ ok: true, host: 'devbox.local', port: 3000, testedAt: 1000 })
  })
  await expect(pending).rejects.toThrow('request_expired')
  expect(loadLocalNetworkConnectionSuccess()).toBeNull()
  render(
    <>
      <LocalNetworkConnectionTest />
      <LocalNetworkConnectionTest />
    </>
  )
  await expect(invoke({ viewerId: 7, operation: 'local-network-test.get' })).rejects.toThrow(
    'connections_viewer_ambiguous'
  )
})

it('does not publish native late success after its form has unmounted', async () => {
  const view = render(<LocalNetworkConnectionTest />)
  fireEvent.click(screen.getByRole('button', { name: /^Test connection/ }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Host' }), {
    target: { value: 'native.local' }
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Port' }), { target: { value: '3000' } })
  let finish: ((result: LocalNetworkConnectionTestResult) => void) | undefined
  test.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
  expect(test).toHaveBeenCalledOnce()
  view.unmount()
  await act(async () => {
    finish?.({ ok: true, host: 'native.local', port: 3000, testedAt: 1000 })
  })
  expect(loadLocalNetworkConnectionSuccess()).toBeNull()
})
