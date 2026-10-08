import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceCleanupScanRequests } from './workspace-cleanup-scan-requests'
import type { WorkspaceCleanupScanResult } from '../shared/workspace-cleanup'
let requests: WorkspaceCleanupScanRequests | undefined
afterEach(() => {
  requests?.dispose()
  vi.useRealTimers()
})
it('keeps cancellation pending until its own scanner settles and discards late results', async () => {
  let finish: ((result: WorkspaceCleanupScanResult) => void) | undefined
  let signal: AbortSignal | undefined
  requests = new WorkspaceCleanupScanRequests((_args, options) => {
    signal = options.signal
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const owner = requests
  const started = owner.start({ worktreeIds: [] })
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect(owner.cancel(started.requestId).state).toBe('cancel_requested')
  expect(signal?.aborted).toBe(true)
  expect(() => owner.start({})).toThrow(/pending/)
  finish?.({ scannedAt: 1, candidates: [], errors: [] })
  await vi.waitFor(() => expect(owner.status(started.requestId).state).toBe('cancelled'))
  expect(() => owner.result(started.requestId)).toThrow(/completed/)
})
it('retains only one completed result for fifteen minutes and hides scanner failures', async () => {
  vi.useFakeTimers()
  const scan = vi.fn().mockResolvedValue({ scannedAt: 1, candidates: [], errors: [] })
  requests = new WorkspaceCleanupScanRequests(scan)
  const owner = requests
  const first = owner.start({})
  await vi.waitFor(() => expect(owner.status(first.requestId).state).toBe('completed'))
  expect(owner.result(first.requestId)).toEqual({ scannedAt: 1, candidates: [], errors: [] })
  const next = owner.start({})
  expect(() => owner.status(first.requestId)).toThrow('selector_not_found')
  await vi.waitFor(() => expect(owner.status(next.requestId).state).toBe('completed'))
  vi.advanceTimersByTime(15 * 60 * 1000)
  expect(() => owner.status(next.requestId)).toThrow('selector_not_found')
  scan.mockRejectedValueOnce(new Error('private-canary'))
  const failed = owner.start({})
  await vi.waitFor(() => expect(owner.status(failed.requestId).state).toBe('failed'))
  expect(owner.status(failed.requestId).state).toBe('failed')
  expect(JSON.stringify(owner.status(failed.requestId))).not.toContain('private-canary')
})
