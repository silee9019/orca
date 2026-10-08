import { JiraCancellableRequests } from './ipc/jira-cancellable-requests'
import { afterEach, expect, it, vi } from 'vitest'
import { JiraCliReadRequests } from './jira-cli-read-requests'

const requests = new JiraCliReadRequests<string>()
afterEach(() => {
  requests.dispose()
  vi.useRealTimers()
})
it('keeps cancellation requested until a non-cooperative provider settles, discarding late success', async () => {
  let finish: ((value: string) => void) | undefined
  let signal: AbortSignal | undefined
  const request = requests.start((value) => {
    signal = value
    return new Promise<string>((resolve) => {
      finish = resolve
    })
  })
  expect(request.state).toBe('pending')
  expect(requests.cancel(request.requestId).state).toBe('cancel_requested')
  expect(signal?.aborted).toBe(true)
  expect(requests.cancel(request.requestId).state).toBe('cancel_requested')
  finish?.('late private result')
  await vi.waitFor(() => expect(requests.status(request.requestId).state).toBe('cancelled'))
  expect(requests.status(request.requestId).result).toBeUndefined()
})
it('bounds pending and retained requests, aborts at deadline and expires only settled records', async () => {
  vi.useFakeTimers()
  const signals: AbortSignal[] = []
  const finishes: ((value: string) => void)[] = []
  const ids = Array.from(
    { length: 32 },
    () =>
      requests.start((signal) => {
        signals.push(signal)
        return new Promise<string>((resolve) => {
          finishes.push(resolve)
        })
      }).requestId
  )
  expect(() => requests.start(async () => '')).toThrow('jira_cli_read_busy')
  await vi.advanceTimersByTimeAsync(30_000)
  expect(signals.every((signal) => signal.aborted)).toBe(true)
  expect(ids.every((id) => requests.status(id).state === 'cancel_requested')).toBe(true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(() => requests.start(async () => '')).toThrow('jira_cli_read_busy')
  for (const finish of finishes) {
    finish('late')
  }
  await vi.advanceTimersByTimeAsync(0)
  expect(ids.every((id) => requests.status(id).state === 'cancelled')).toBe(true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(() => requests.status(ids[0]!)).toThrow('selector_not_found')
  const fresh = requests.start(async () => 'fresh')
  await vi.advanceTimersByTimeAsync(0)
  expect(requests.status(fresh.requestId)).toMatchObject({ state: 'completed', result: 'fresh' })
})
it('does not reveal provider errors and ignores unknown IDs without storing tombstones', async () => {
  for (let i = 0; i < 100; i++) {
    expect(() => requests.cancel(String(i))).toThrow('selector_not_found')
  }
  const request = requests.start(async () => {
    throw new Error('private provider credentials')
  })
  await vi.waitFor(() => expect(requests.status(request.requestId).state).toBe('failed'))
  expect(JSON.stringify(requests.status(request.requestId))).not.toContain('credentials')
})
it('disposes only owned requests without leaving late-completion timers', async () => {
  vi.useFakeTimers()
  let finish: ((value: string) => void) | undefined
  let signal: AbortSignal | undefined
  requests.start((value) => {
    signal = value
    return new Promise<string>((resolve) => {
      finish = resolve
    })
  })
  requests.dispose()
  expect(signal?.aborted).toBe(true)
  finish?.('late')
  await vi.advanceTimersByTimeAsync(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('leaves a renderer request with the same UUID running in its original owner scope', async () => {
  const renderer = new JiraCancellableRequests()
  let rendererSignal: AbortSignal | undefined
  let finishRenderer: (() => void) | undefined
  let finishCli: ((value: string) => void) | undefined
  const request = requests.start(
    () =>
      new Promise<string>((resolve) => {
        finishCli = resolve
      })
  )
  const rendererRead = renderer.run(request.requestId, (signal) => {
    rendererSignal = signal
    return new Promise<void>((resolve) => {
      finishRenderer = resolve
    })
  })
  requests.cancel(request.requestId)
  expect(rendererSignal?.aborted).toBe(false)
  finishCli?.('late')
  finishRenderer?.()
  await rendererRead
})
