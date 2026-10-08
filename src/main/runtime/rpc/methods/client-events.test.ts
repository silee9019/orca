import { setSshCredentialManagement } from '../../../ssh/ssh-target-registry'
import { describe, expect, it, vi } from 'vitest'
import { RuntimeSubscriptionRegistry } from '../../runtime-subscription-registry'
import type { RuntimeClientEvent } from '../../../../shared/runtime-client-events'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  eraseRpcMethods,
  isStreamingMethod,
  type RpcContext,
  type RpcStreamingMethod
} from '../core'
// Why: importing client-events directly trips its module-init cycle through ipc/ssh; the index resolves it.
import { ALL_RPC_METHODS } from './index'

vi.mock('../../../ipc/mobile-connection-management', () => ({
  getMobileConnectionManagement: () => ({
    getRelayStatus: () => ({ status: 'registered', cellUrl: 'private-cell-canary' })
  })
}))

const subscribeMethod = eraseRpcMethods(ALL_RPC_METHODS).find(
  (method) => method.name === 'runtime.clientEvents.subscribe' && isStreamingMethod(method)
) as RpcStreamingMethod

function makeRuntime(): {
  runtime: OrcaRuntimeService
  onClientEvent: ReturnType<typeof vi.fn>
  cleanups: (() => void)[]
} {
  const cleanups: (() => void)[] = []
  const onClientEvent = vi.fn(
    (
      _listener: (event: RuntimeClientEvent) => void,
      _options?: { consumesTerminalSideEffects?: boolean }
    ) =>
      () => {}
  )
  const runtime = {
    onClientEvent,
    registerSubscriptionCleanup: (_id: string, cleanup: () => void) => {
      cleanups.push(cleanup)
    }
  } as unknown as OrcaRuntimeService
  return { runtime, onClientEvent, cleanups }
}

describe('runtime.clientEvents.subscribe', () => {
  it('registers mobile subscriptions as non-consumers of terminal side effects', async () => {
    const { runtime, onClientEvent, cleanups } = makeRuntime()

    const done = subscribeMethod.handler(
      undefined,
      { runtime, connectionId: 'conn-1', clientKind: 'mobile' } as RpcContext,
      () => {}
    )

    expect(onClientEvent).toHaveBeenCalledWith(expect.any(Function), {
      consumesTerminalSideEffects: false
    })
    cleanups.forEach((cleanup) => cleanup())
    await done
  })

  it('keeps non-mobile subscriptions consuming terminal side effects', async () => {
    const { runtime, onClientEvent, cleanups } = makeRuntime()

    const done = subscribeMethod.handler(
      undefined,
      { runtime, connectionId: 'conn-1' } as RpcContext,
      () => {}
    )

    expect(onClientEvent).toHaveBeenCalledWith(expect.any(Function), {
      consumesTerminalSideEffects: true
    })
    cleanups.forEach((cleanup) => cleanup())
    await done
  })
})

it('releases the canonical client-event listener on local abort and ignores repeated abort', async () => {
  const { runtime, onClientEvent } = makeRuntime()
  const stop = vi.fn()
  onClientEvent.mockReturnValue(stop)
  const registry = new RuntimeSubscriptionRegistry()
  runtime.registerSubscriptionCleanup = (id, cleanup, connectionId) =>
    registry.register(id, cleanup, connectionId)
  runtime.cleanupSubscription = (id) => registry.cleanup(id)
  const abort = new AbortController()
  const emit = vi.fn()
  const context: RpcContext = { runtime, connectionId: 'local-watch-a', signal: abort.signal }
  const pending = subscribeMethod.handler(undefined, context, emit)
  expect(onClientEvent).toHaveBeenCalledOnce()
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  abort.abort()
  abort.abort()
  await pending
  expect(stop).toHaveBeenCalledOnce()
  expect(emit.mock.calls.filter(([frame]) => frame.type === 'end')).toHaveLength(1)
})
it('does not register a listener for an already aborted local subscription', async () => {
  const { runtime, onClientEvent } = makeRuntime()
  const abort = new AbortController()
  abort.abort()
  const emit = vi.fn()
  const context: RpcContext = { runtime, connectionId: 'local-watch-expired', signal: abort.signal }
  await subscribeMethod.handler(undefined, context, emit)
  expect(onClientEvent).not.toHaveBeenCalled()
  expect(emit).toHaveBeenCalledExactlyOnceWith({ type: 'end' })
})

it('publishes canonical local credential snapshots and excludes their private details', async () => {
  const { runtime, onClientEvent, cleanups } = makeRuntime()
  setSshCredentialManagement({
    listRequests: () => [
      {
        requestId: 'request-a',
        targetId: 'host-a',
        kind: 'password',
        detail: 'private-broker-canary'
      }
    ],
    submitCredential: () => false
  })
  const emit = vi.fn()
  try {
    const context: RpcContext = { runtime, connectionId: 'local-client-events-fixture' }
    const pending = subscribeMethod.handler({ connections: true }, context, emit)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ready',
        snapshot: expect.objectContaining({
          sshCredentials: {
            requests: [{ requestId: 'request-a', targetId: 'host-a', kind: 'password' }]
          }
        })
      })
    )
    const listener = onClientEvent.mock.calls[0]?.[0]
    if (typeof listener !== 'function') {
      throw new Error('missing listener')
    }
    listener({ type: 'sshCredentialsChanged', observation: { requests: [] } })
    expect(emit).toHaveBeenLastCalledWith({
      type: 'sshCredentialsChanged',
      observation: { requests: [] }
    })
    expect(JSON.stringify(emit.mock.calls)).not.toContain('private-')
    cleanups.forEach((cleanup) => cleanup())
    await pending
  } finally {
    setSshCredentialManagement(null)
  }
})
it('does not send credential events to old/default or paired subscriptions', async () => {
  const { runtime, onClientEvent, cleanups } = makeRuntime()
  const emit = vi.fn()
  const pending = subscribeMethod.handler(
    undefined,
    { runtime, connectionId: 'paired-connection', clientKind: 'runtime' },
    emit
  )
  const before = emit.mock.calls.length
  const listener = onClientEvent.mock.calls[0]?.[0]
  if (typeof listener !== 'function') {
    throw new Error('missing listener')
  }
  listener({
    type: 'sshCredentialsChanged',
    observation: {
      requests: [{ requestId: 'private-id-canary', targetId: 'host-a', kind: 'password' }]
    }
  })
  listener({
    type: 'sshPortsChanged',
    observation: { source: 'detected', targetId: 'host-a', ports: [3000] }
  })
  listener({ type: 'mobileRelayChanged', observation: { status: 'offline' } })
  expect(emit).toHaveBeenCalledTimes(before)
  cleanups.forEach((cleanup) => cleanup())
  await pending
  for (const peer of [
    { clientKind: 'runtime' as const },
    { clientKind: 'mobile' as const },
    { clientId: 'paired-token' },
    { pairedDeviceId: 'device-a' },
    { authenticatedCallerFingerprint: 'fingerprint-a' }
  ]) {
    await expect(
      subscribeMethod.handler(
        { connections: true },
        { runtime, connectionId: 'local-client-events-fixture', ...peer },
        emit
      )
    ).rejects.toThrow('local_connection_required')
    await expect(
      subscribeMethod.handler(
        { ports: true, relay: true },
        { runtime, connectionId: 'local-client-events-fixture', ...peer },
        emit
      )
    ).rejects.toThrow('local_connection_required')
  }
})

it('attaches before the canonical relay snapshot and strips private relay detail', async () => {
  const { runtime, onClientEvent } = makeRuntime()
  const registry = new RuntimeSubscriptionRegistry()
  runtime.registerSubscriptionCleanup = (id, cleanup, connectionId) =>
    registry.register(id, cleanup, connectionId)
  runtime.cleanupSubscription = (id) => registry.cleanup(id)
  const stop = vi.fn()
  onClientEvent.mockReturnValue(stop)
  const abort = new AbortController()
  const emit = vi.fn()
  const pending = subscribeMethod.handler(
    { relay: true },
    { runtime, connectionId: 'local-client-events-relay', signal: abort.signal },
    emit
  )
  expect(emit).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'ready',
      snapshot: expect.objectContaining({ mobileRelay: { status: 'registered' } })
    })
  )
  const listener = onClientEvent.mock.calls[0]?.[0]
  if (typeof listener !== 'function') {
    throw new Error('missing listener')
  }
  listener({ type: 'mobileRelayChanged', observation: { status: 'offline' } })
  expect(emit).toHaveBeenLastCalledWith({
    type: 'mobileRelayChanged',
    observation: { status: 'offline' }
  })
  expect(JSON.stringify(emit.mock.calls)).not.toContain('private-')
  abort.abort()
  await pending
  expect(stop).toHaveBeenCalledOnce()
})
