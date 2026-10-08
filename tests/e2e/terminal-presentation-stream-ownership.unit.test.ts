import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { createRuntime } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import {
  subscribeTerminalPresentationStream,
  getActiveTerminalPresentationStreamCount
} from '../../src/main/runtime/terminal-presentation-stream'

it('bounds continuous subscriptions and isolates replacement and disconnect cleanup by connection', () => {
  const runtime = createRuntime()
  const original = runtime.subscribeToDriverChanges.bind(runtime)
  const disposals: ReturnType<typeof vi.fn>[] = []
  vi.spyOn(runtime, 'subscribeToDriverChanges').mockImplementation((id, listener) => {
    const dispose = vi.fn(original(id, listener))
    disposals.push(dispose)
    return dispose
  })
  const params = {
    terminal: 't1',
    expectedPtyId: 'fixture',
    expectedIncarnationId: 'fixture',
    expectedExecutionHostId: 'local',
    kind: 'driver' as const,
    subscriptionId: randomUUID()
  }
  const first = vi.fn(),
    second = vi.fn(),
    replacement = vi.fn()
  const firstSignal = new AbortController()
  try {
    subscribeTerminalPresentationStream(
      params,
      { runtime, connectionId: 'first', signal: firstSignal.signal },
      first,
      () => {}
    )
    subscribeTerminalPresentationStream(
      params,
      { runtime, connectionId: 'second' },
      second,
      () => {}
    )
    expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(2)
    subscribeTerminalPresentationStream(
      params,
      { runtime, connectionId: 'first' },
      replacement,
      () => {}
    )
    expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(2)
    expect(disposals[0]).toHaveBeenCalledOnce()
    expect(first).toHaveBeenLastCalledWith({ type: 'end', sequence: 0 })
    firstSignal.abort()
    expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(2)
    runtime.cleanupSubscriptionsForConnection('first')
    expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(1)
    expect(disposals[1]).not.toHaveBeenCalled()
    expect(disposals[2]).toHaveBeenCalledOnce()
    for (let index = 1; index < 64; index += 1) {
      subscribeTerminalPresentationStream(
        { ...params, subscriptionId: randomUUID() },
        { runtime, connectionId: 'budget' },
        () => {},
        () => {}
      )
    }
    expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(64)
    expect(() =>
      subscribeTerminalPresentationStream(
        { ...params, subscriptionId: randomUUID() },
        { runtime, connectionId: 'overflow' },
        () => {},
        () => {}
      )
    ).toThrow('runtime_event_stream_capacity')
    expect(disposals).toHaveLength(66)
    runtime.cleanupSubscriptionsForConnection('budget')
    expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(1)
    expect(second).toHaveBeenCalledOnce()
    runtime.cleanupSubscriptionsForConnection('second')
    expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(0)
    for (const dispose of disposals) {
      expect(dispose).toHaveBeenCalledOnce()
    }
  } finally {
    for (const connection of ['first', 'second', 'budget', 'overflow']) {
      runtime.cleanupSubscriptionsForConnection(connection)
    }
    vi.restoreAllMocks()
  }
})
