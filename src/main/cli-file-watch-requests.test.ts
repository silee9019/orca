import { afterEach, expect, it, vi } from 'vitest'
import { CliFileWatchRequests } from './cli-file-watch-requests'
import type { OrcaRuntimeService } from './runtime/orca-runtime'
import type { FsChangeEvent } from '../shared/filesystem-entry-types'

const requests = new CliFileWatchRequests()
afterEach(async () => {
  await requests.dispose()
  vi.useRealTimers()
})
function runtime(watchFileExplorer: OrcaRuntimeService['watchFileExplorer']) {
  return { watchFileExplorer }
}
it('waits for a late install and the exact unsubscribe before reporting stopped', async () => {
  let install: ((close: () => Promise<void>) => void) | undefined
  let finishClose: (() => void) | undefined
  let signal: AbortSignal | undefined
  const close = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishClose = resolve
      })
  )
  const request = requests.start(
    runtime(async (_worktree, _callback, _error, value) => {
      signal = value
      return new Promise<() => Promise<void>>((resolve) => {
        install = resolve
      })
    }),
    'workspace'
  )
  await Promise.resolve()
  const stopped = requests.stop(request.requestId)
  expect(signal?.aborted).toBe(true)
  expect(requests.status(request.requestId).state).toBe('stop_requested')
  install?.(close)
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(requests.status(request.requestId).state).toBe('stop_requested')
  finishClose?.()
  expect((await stopped).state).toBe('stopped')
})
it('retains a failed unsubscribe for exact-owner retry', async () => {
  const close = vi
    .fn()
    .mockRejectedValueOnce(new Error('native close failed'))
    .mockResolvedValue(undefined)
  const request = requests.start(
    runtime(async () => close),
    'workspace'
  )
  await vi.waitFor(() => expect(requests.status(request.requestId).state).toBe('watching'))
  await expect(requests.stop(request.requestId)).rejects.toThrow('file_watch_cleanup_failed')
  expect(requests.status(request.requestId)).toMatchObject({
    state: 'failed',
    cleanupPending: true
  })
  expect((await requests.stop(request.requestId)).state).toBe('stopped')
  expect(close).toHaveBeenCalledTimes(2)
})
it('bounds events and preserves explicit gaps and overflow rather than a complete snapshot claim', async () => {
  let emit: ((events: FsChangeEvent[]) => void) | undefined
  const request = requests.start(
    runtime(async (_workspace, callback) => {
      emit = callback
      return async () => {}
    }),
    'workspace'
  )
  await vi.waitFor(() => expect(requests.status(request.requestId).state).toBe('watching'))
  emit?.(Array.from({ length: 300 }, (_, i) => ({ kind: 'update', absolutePath: `/fixture/${i}` })))
  const status = requests.status(request.requestId)
  expect(status.events).toHaveLength(128)
  expect(status.sequence).toBe(300)
  expect(status.overflow).toBe(true)
  expect(status.events[0]?.sequence).toBe(173)
  expect(requests.status(request.requestId, 290).events).toHaveLength(10)
  expect(requests.status(request.requestId, 290).overflow).toBe(false)
  emit?.([{ kind: 'overflow', absolutePath: '/fixture' }])
  expect(requests.status(request.requestId, 300).overflow).toBe(true)
  emit?.([{ kind: 'update', absolutePath: 'x'.repeat(70_000) }])
  expect(Buffer.byteLength(JSON.stringify(requests.status(request.requestId)))).toBeLessThan(66_000)
  expect(requests.status(request.requestId, 301).overflow).toBe(true)
  expect(() => requests.status(request.requestId, 999)).toThrow('file_watch_cursor_invalid')
})
it('limits leases and expires idle active and terminal requests', async () => {
  vi.useFakeTimers()
  const close = vi.fn().mockResolvedValue(undefined)
  const ids = Array.from(
    { length: 8 },
    () =>
      requests.start(
        runtime(async () => close),
        'workspace'
      ).requestId
  )
  await vi.advanceTimersByTimeAsync(0)
  expect(() =>
    requests.start(
      runtime(async () => close),
      'workspace'
    )
  ).toThrow('file_watch_busy')
  await vi.advanceTimersByTimeAsync(60_000)
  expect(close).toHaveBeenCalledTimes(8)
  expect(requests.status(ids[0]!).state).toBe('stopped')
  await vi.advanceTimersByTimeAsync(60_000)
  expect(() => requests.status(ids[0]!)).toThrow('selector_not_found')
})
it('retains failure without provider error text and rejects unknown stop IDs', async () => {
  const request = requests.start(
    runtime(async () => {
      throw new Error('private provider credentials')
    }),
    'workspace'
  )
  await vi.waitFor(() => expect(requests.status(request.requestId).state).toBe('failed'))
  expect(JSON.stringify(requests.status(request.requestId))).not.toContain('credentials')
  expect(() => requests.status('renderer-subscription')).toThrow('selector_not_found')
  await expect(requests.stop('renderer-subscription')).rejects.toThrow('selector_not_found')
})
