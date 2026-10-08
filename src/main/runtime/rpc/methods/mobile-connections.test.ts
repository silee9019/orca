import { beforeEach, expect, it, vi } from 'vitest'
import { buildRegistry } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { MOBILE_CONNECTION_METHODS } from './mobile-connections'
const fixture = vi.hoisted(() => ({ mintRuntime: vi.fn(), mintMobile: vi.fn(), signedIn: false }))
vi.mock('../../../ipc/mobile-connection-management', () => ({
  getMobileConnectionManagement: () => ({
    getRuntimePairingUrl: fixture.mintRuntime,
    getPairingQR: fixture.mintMobile,
    isSignedIn: () => fixture.signedIn
  })
}))
const registry = buildRegistry(MOBILE_CONNECTION_METHODS)
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The boundary methods only inspect transport identity and never call runtime services.
const runtime = {} as OrcaRuntimeService
beforeEach(() => {
  vi.clearAllMocks()
  fixture.signedIn = false
})
it('rejects this-computer pairing with a network address before the exposure owner runs', async () => {
  const method = registry.get('mobile.connection.runtimePairing')
  if (!method || 'stream' in method) {
    throw new Error('missing method')
  }
  await expect(
    Promise.resolve().then(() =>
      method.handler({ reach: 'this-computer', address: '192.168.1.10' }, { runtime })
    )
  ).rejects.toThrow('loopback_address_required')
  expect(fixture.mintRuntime).not.toHaveBeenCalled()
})
it('forces loopback for this-computer pairing when no address is specified', async () => {
  const method = registry.get('mobile.connection.runtimePairing')
  if (!method || 'stream' in method) {
    throw new Error('missing method')
  }
  await method.handler({ reach: 'this-computer' }, { runtime })
  expect(fixture.mintRuntime).toHaveBeenCalledWith({ reach: 'this-computer', address: '127.0.0.1' })
})
it('refuses automatic pairing while signed out without minting a pending token', async () => {
  const method = registry.get('mobile.connection.pairing')
  if (!method || 'stream' in method) {
    throw new Error('missing method')
  }
  await expect(
    Promise.resolve().then(() => method.handler({ connectionMode: 'automatic' }, { runtime }))
  ).rejects.toThrow('sign_in_required_for_relay_pairing')
  expect(fixture.mintMobile).not.toHaveBeenCalled()
})
