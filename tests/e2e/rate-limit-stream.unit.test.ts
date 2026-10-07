import { expect, it, vi } from 'vitest'
import { setup, command } from './usage-cli-test-fixture'
import { RuntimeSubscriptionRegistry } from '../../src/main/runtime/runtime-subscription-registry'
import { isStreamingMethod } from '../../src/main/runtime/rpc/core'
it('runs the public event reader through existing service onUpdate and removes its listener on count', async () => {
  const { client, rates, runtime, registry } = setup()
  const remove = vi.fn()
  rates.onStateChange.mockReturnValue(remove)
  const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
  Object.defineProperty(client, 'observeRateLimits', {
    value: async (_timeout: number, signal: AbortSignal, onFrame: (frame: unknown) => void) => {
      const method = registry.get('rateLimits.subscribe')
      if (!method || !isStreamingMethod(method)) {
        throw new Error('missing_subscription')
      }
      const pending = method.handler(null, { runtime, signal }, onFrame)
      const listener = rates.onStateChange.mock.calls.at(-1)?.[0]
      if (!listener) {
        throw new Error('missing_listener')
      }
      listener(rates.getState())
      await pending
      return 'cancelled'
    }
  })
  await command(client, ['rate-limit', 'observe-stream', '--count', '2', '--timeout-ms', '1000'])
  expect(rates.onStateChange).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledOnce()
  expect(rates.refresh).not.toHaveBeenCalled()
  expect(logs.mock.calls.map((call) => JSON.parse(String(call[0])).type)).toEqual([
    'ready',
    'snapshot',
    'end',
    'closed'
  ])
})

function abortFixture() {
  const { runtime, rates, registry } = setup()
  const subscriptions = new RuntimeSubscriptionRegistry()
  const register = vi
    .spyOn(runtime, 'registerSubscriptionCleanup')
    .mockImplementation((id, cleanup, connectionId) =>
      subscriptions.register(id, cleanup, connectionId)
    )
  vi.spyOn(runtime, 'cleanupSubscription').mockImplementation((id) => subscriptions.cleanup(id))
  const method = registry.get('rateLimits.subscribe')
  if (!method || !isStreamingMethod(method)) {
    throw new Error('missing_subscription')
  }
  return { runtime, rates, subscriptions, register, method }
}
it('aborts without a connection id and preserves a sibling subscription in the actual registry', async () => {
  const { runtime, rates, subscriptions, register, method } = abortFixture()
  const first = new AbortController()
  const second = new AbortController()
  const detachFirst = vi.fn(),
    detachSecond = vi.fn()
  rates.onStateChange.mockReturnValueOnce(detachFirst).mockReturnValueOnce(detachSecond)
  let firstSettled = false,
    secondSettled = false
  const pendingFirst = method
    .handler(null, { runtime, signal: first.signal }, () => {})
    .then(() => {
      firstSettled = true
    })
  const pendingSecond = method
    .handler(null, { runtime, signal: second.signal }, () => {})
    .then(() => {
      secondSettled = true
    })
  const firstId = register.mock.calls[0][0],
    secondId = register.mock.calls[1][0]
  try {
    first.abort()
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(detachFirst).toHaveBeenCalledOnce()
    expect(firstSettled).toBe(true)
    expect(secondSettled).toBe(false)
    expect(detachSecond).not.toHaveBeenCalled()
    expect(subscriptions.cleanupIfOwnedByConnection(firstId, 'other')).toBe(true)
    expect(subscriptions.cleanupIfOwnedByConnection(secondId, 'other')).toBe(false)
    runtime.cleanupSubscription(firstId)
    runtime.cleanupSubscription(secondId)
    second.abort()
    await Promise.all([pendingFirst, pendingSecond])
    expect(detachFirst).toHaveBeenCalledOnce()
    expect(detachSecond).toHaveBeenCalledOnce()
  } finally {
    subscriptions.cleanup(firstId)
    subscriptions.cleanup(secondId)
  }
})
it('does not register a listener for an already aborted signal', async () => {
  const { runtime, rates, register, method } = abortFixture()
  const controller = new AbortController()
  controller.abort()
  const emit = vi.fn()
  await method.handler(null, { runtime, signal: controller.signal }, emit)
  expect(rates.onStateChange).not.toHaveBeenCalled()
  expect(register).not.toHaveBeenCalled()
  expect(emit).not.toHaveBeenCalled()
})
it('settles and removes the actual registration when the ready reply throws', async () => {
  const { runtime, rates, subscriptions, register, method } = abortFixture()
  const detach = vi.fn()
  rates.onStateChange.mockReturnValue(detach)
  const emit = vi.fn(() => {
    throw new Error('fixture_closed_reply')
  })
  const pending = method.handler(null, { runtime, signal: new AbortController().signal }, emit)
  const id = register.mock.calls[0][0]
  try {
    await expect(pending).rejects.toThrow('fixture_closed_reply')
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(detach).toHaveBeenCalledOnce()
    expect(subscriptions.cleanupIfOwnedByConnection(id, 'other')).toBe(true)
  } finally {
    subscriptions.cleanup(id)
  }
})

it('settles and removes the listener when an update reply throws after ready', async () => {
  const { runtime, rates, subscriptions, register, method } = abortFixture()
  const detach = vi.fn()
  rates.onStateChange.mockReturnValue(detach)
  const controller = new AbortController()
  const removeAbort = vi.spyOn(controller.signal, 'removeEventListener')
  let ready = true
  const pending = method.handler(null, { runtime, signal: controller.signal }, () => {
    if (!ready) {
      throw new Error('fixture_closed_update')
    }
    ready = false
  })
  const id = register.mock.calls[0][0]
  const listener = rates.onStateChange.mock.calls[0][0]
  try {
    listener(rates.getState())
    await expect(pending).rejects.toThrow('fixture_closed_update')
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(detach).toHaveBeenCalledOnce()
    expect(removeAbort).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(subscriptions.cleanupIfOwnedByConnection(id, 'other')).toBe(true)
    controller.abort()
    expect(detach).toHaveBeenCalledOnce()
  } finally {
    subscriptions.cleanup(id)
  }
})
