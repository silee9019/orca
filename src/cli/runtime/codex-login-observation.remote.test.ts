import { RemoteRuntimeSubscriptionFrameRouter } from '../../shared/remote-runtime-subscription-frame-router'
import { encrypt } from '../../shared/e2ee-crypto'
import { afterEach, expect, it, vi } from 'vitest'
import type { RemoteRuntimeSubscriptionCallbacks } from '../../shared/remote-runtime-client'
import type { PairingOffer } from '../../shared/pairing'
import { observeCodexLoginTransport } from './account-observation-transport'
const remote = vi.hoisted(() => ({ subscribe: vi.fn(), close: vi.fn() }))
vi.mock('../../shared/remote-runtime-client', () => ({
  subscribeRemoteRuntimeRequest: remote.subscribe
}))
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
const pairing: PairingOffer = {
  v: 2,
  endpoint: 'ws://fixture.invalid',
  deviceToken: 'fixture-private-token',
  publicKeyB64: 'fixture-key'
}
it('reuses the existing authenticated remote subscription for the fixed method, projects domain events and closes on abort', async () => {
  let callback: RemoteRuntimeSubscriptionCallbacks<unknown> | undefined
  remote.subscribe.mockImplementation(
    async (_pairing, method, params, timeout, callbacks, options) => {
      expect(method).toBe('accounts.observeCodexLogin')
      expect(params).toBeUndefined()
      expect(timeout).toBe(1000)
      expect(options.signal).toBeInstanceOf(AbortSignal)
      callback = callbacks
      return { requestId: 'fixed-request', close: remote.close, sendBinary: () => false }
    }
  )
  const controller = new AbortController()
  const emit = vi.fn()
  const pending = observeCodexLoginTransport(
    '/must-not-read-local-metadata',
    pairing,
    1000,
    controller.signal,
    emit
  )
  await Promise.resolve()
  callback?.onResponse({
    id: 'fixed-request',
    ok: true,
    result: { type: 'ready', pending: false, revision: 0 },
    _meta: { runtimeId: 'remote-fixture' }
  })
  callback?.onResponse({
    id: 'fixed-request',
    ok: true,
    result: { type: 'changed', pending: true, revision: 1 },
    _meta: { runtimeId: 'remote-fixture' }
  })
  controller.abort()
  expect(await pending).toBe('cancelled')
  expect(remote.close).toHaveBeenCalledOnce()
  callback?.onResponse({
    id: 'fixed-request',
    ok: true,
    result: { type: 'changed', pending: false, revision: 2 },
    _meta: { runtimeId: 'remote-fixture' }
  })
  expect(emit).toHaveBeenCalledTimes(2)
})
it('fails closed on a different runtime or invalid domain frame and closes the inherited stream', async () => {
  let callback: RemoteRuntimeSubscriptionCallbacks<unknown> | undefined
  remote.subscribe.mockImplementation(async (_p, _m, _a, _t, callbacks) => {
    callback = callbacks
    return { requestId: 'fixed-request', close: remote.close, sendBinary: () => false }
  })
  const pending = observeCodexLoginTransport(
    '/unused',
    pairing,
    1000,
    new AbortController().signal,
    vi.fn()
  )
  const rejection = expect(pending).rejects.toThrow('Observed runtime changed')
  await Promise.resolve()
  callback?.onResponse({
    id: 'fixed-request',
    ok: true,
    result: { type: 'ready', pending: false, revision: 0 },
    _meta: { runtimeId: 'host-a' }
  })
  callback?.onResponse({
    id: 'fixed-request',
    ok: true,
    result: { type: 'changed', pending: true, revision: 1 },
    _meta: { runtimeId: 'host-b' }
  })
  await rejection
  expect(remote.close).toHaveBeenCalledOnce()
})

it('inherits request correlation from the existing encrypted frame router', () => {
  const sharedKey = new Uint8Array(32).fill(7)
  const fail = vi.fn()
  const response = vi.fn()
  const router = new RemoteRuntimeSubscriptionFrameRouter({
    sharedKey,
    serializedAuth: '{}',
    serializedRequest: '{}',
    requestId: 'codex-observer',
    send: vi.fn(),
    fail,
    onAuthenticated: vi.fn(),
    callbacks: { onResponse: response }
  })
  router.state = 'ready'
  router.handleFrame(
    Buffer.from(
      encrypt(
        JSON.stringify({
          id: 'different-stream',
          ok: true,
          result: { type: 'ready', pending: false, revision: 0 },
          _meta: { runtimeId: 'fixture-runtime' }
        }),
        sharedKey
      )
    ),
    false
  )
  expect(response).not.toHaveBeenCalled()
  expect(fail).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ code: 'invalid_runtime_response' })
  )
})
