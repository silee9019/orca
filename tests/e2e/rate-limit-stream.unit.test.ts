import { expect, it, vi } from 'vitest'
import { setup, command } from './usage-cli-test-fixture'
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
      const close = () => runtime.cleanupSubscriptionsForConnection('fixture-stream')
      signal.addEventListener('abort', close, { once: true })
      try {
        const pending = method.handler(null, { runtime, connectionId: 'fixture-stream' }, onFrame)
        const listener = rates.onStateChange.mock.calls.at(-1)?.[0]
        if (!listener) {
          throw new Error('missing_listener')
        }
        listener(rates.getState())
        await pending
        return 'cancelled'
      } finally {
        signal.removeEventListener('abort', close)
        close()
      }
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
