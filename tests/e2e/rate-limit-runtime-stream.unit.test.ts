import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setup } from './usage-cli-test-fixture'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { RuntimeSubscriptionRegistry } from '../../src/main/runtime/runtime-subscription-registry'
import { RATE_LIMIT_METHODS } from '../../src/main/runtime/rpc/methods/rate-limits'
import { isStreamingMethod } from '../../src/main/runtime/rpc/core'
import type { RateLimitState } from '../../src/shared/rate-limit-types'

it('releases signal-only subscriptions through production Unix admission, dispatcher and the actual registry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orca-rate-runtime-'))
  const { runtime, rates } = setup()
  const subscriptions = new RuntimeSubscriptionRegistry()
  const registered = vi
    .spyOn(runtime, 'registerSubscriptionCleanup')
    .mockImplementation((id, cleanup, connectionId) =>
      subscriptions.register(id, cleanup, connectionId)
    )
  vi.spyOn(runtime, 'cleanupSubscription').mockImplementation((id) => subscriptions.cleanup(id))
  const listeners = new Set<(state: RateLimitState) => void>()
  const detached = vi.fn()
  rates.onStateChange.mockImplementation((listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      detached()
    }
  })
  const subscription = RATE_LIMIT_METHODS.find((method) => method.name === 'rateLimits.subscribe')
  if (!subscription || !isStreamingMethod(subscription)) {
    throw new Error('missing_subscription')
  }
  const originalHandler = subscription.handler
  let settled = 0
  vi.spyOn(subscription, 'handler').mockImplementation(async (...args) => {
    try {
      await originalHandler(...args)
    } finally {
      settled++
    }
  })
  const server = new OrcaRuntimeRpcServer({
    runtime,
    userDataPath: directory,
    enableWebSocket: false,
    longPollCap: 2,
    keepaliveIntervalMs: 25,
    methods: RATE_LIMIT_METHODS
  })
  const first = new AbortController()
  const second = new AbortController()
  const replacement = new AbortController()
  try {
    await server.start()
    const client = new RuntimeClient(directory, 1000, null, null)
    const firstFrames = vi.fn()
    const secondFrames = vi.fn()
    const pendingFirst = client.observeRateLimits(5000, first.signal, firstFrames)
    const pendingSecond = client.observeRateLimits(5000, second.signal, secondFrames)
    await vi.waitFor(() => {
      expect(firstFrames).toHaveBeenCalledOnce()
      expect(secondFrames).toHaveBeenCalledOnce()
    })
    expect(registered.mock.calls.every((call) => call[2] === undefined)).toBe(true)
    const firstId = registered.mock.calls[0][0]
    const secondId = registered.mock.calls[1][0]
    for (const listener of listeners) {
      listener(rates.getState())
    }
    await vi.waitFor(() => {
      expect(firstFrames).toHaveBeenCalledTimes(2)
      expect(secondFrames).toHaveBeenCalledTimes(2)
    })
    await expect(
      client.observeRateLimits(500, new AbortController().signal, vi.fn())
    ).rejects.toMatchObject({ code: 'runtime_busy' })
    expect((await client.call('rateLimits.get')).result).toEqual(rates.getState())
    await expect(
      client.call('rateLimits.unsubscribe', { subscriptionId: firstId })
    ).rejects.toMatchObject({ code: 'method_not_found' })
    first.abort()
    expect(await pendingFirst).toBe('cancelled')
    await vi.waitFor(() => {
      expect(listeners.size).toBe(1)
      expect(settled).toBe(1)
      expect(detached).toHaveBeenCalledOnce()
    })
    expect(subscriptions.cleanupIfOwnedByConnection(firstId, 'unrelated')).toBe(true)
    expect(subscriptions.cleanupIfOwnedByConnection(secondId, 'unrelated')).toBe(false)
    const replacementFrames = vi.fn(() => replacement.abort())
    expect(await client.observeRateLimits(1000, replacement.signal, replacementFrames)).toBe(
      'cancelled'
    )
    await vi.waitFor(() => expect(settled).toBe(2))
    expect(listeners.size).toBe(1)
    second.abort()
    expect(await pendingSecond).toBe('cancelled')
    await vi.waitFor(() => {
      expect(listeners.size).toBe(0)
      expect(settled).toBe(3)
      expect(detached).toHaveBeenCalledTimes(3)
    })
    expect(subscriptions.cleanupIfOwnedByConnection(secondId, 'unrelated')).toBe(true)
  } finally {
    first.abort()
    second.abort()
    replacement.abort()
    await server.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
