import { afterEach, expect, it, vi } from 'vitest'
import type { GitStatusResult } from '../shared/git-status-types'
import { DesktopGitStatusController } from './desktop-git-status-controller'
import { GitStatusReadLeaseOwner } from '../shared/git-status-read-lease-owner'
const controllers: DesktopGitStatusController[] = []
function create() {
  const controller = new DesktopGitStatusController()
  controllers.push(controller)
  return controller
}
const empty: GitStatusResult = { entries: [], conflictOperation: 'unknown' }
afterEach(() => {
  controllers.splice(0).forEach((c) => c.dispose())
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('cancels only its original read lease while another caller keeps the shared read alive', async () => {
  const controller = create()
  const owner = new GitStatusReadLeaseOwner<GitStatusResult>()
  let finish: ((result: GitStatusResult) => void) | undefined
  let shared: AbortSignal | undefined
  const load = (signal: AbortSignal) => {
    shared = signal
    return new Promise<GitStatusResult>((resolve) => {
      finish = resolve
    })
  }
  const other = owner.lease('same', undefined, load)
  const request = controller.start((signal) => owner.lease('same', signal, load))
  await vi.waitFor(() => expect(shared).toBeDefined())
  expect(() => controller.cancel('foreign')).toThrow('selector_not_found')
  controller.cancel(request.requestId)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('cancelled'))
  expect(shared?.aborted).toBe(false)
  expect(() => controller.result(request.requestId, 0, 10)).toThrow()
  finish?.(empty)
  await expect(other).resolves.toEqual(empty)
})
it('retains a pending slot through cancellation and discards late results', async () => {
  const controller = create()
  let finish: ((result: GitStatusResult) => void) | undefined
  const request = controller.start(
    async () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect(controller.cancel(request.requestId).state).toBe('cancel_requested')
  expect(() => controller.start(async () => empty)).toThrow('desktop_git_status_busy')
  finish?.(empty)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('cancelled'))
  const next = controller.start(async () => empty)
  await vi.waitFor(() => expect(controller.status(next.requestId).state).toBe('completed'))
  expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
})
it('bounds arrays and bytes, copies pages, preserves original metadata and expires settled data', async () => {
  const controller = create()
  const request = controller.start(async () => ({
    ...empty,
    branch: 'fixture',
    didHitLimit: true,
    statusLength: 4000,
    entries: Array.from({ length: 2500 }, (_, i) => ({
      path: String(i),
      status: 'untracked' as const,
      area: 'untracked' as const
    })),
    ignoredPaths: Array.from({ length: 2500 }, (_, i) => `ignored/${i}`)
  }))
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  const result = controller.result(request.requestId, 0, 1)
  expect(result).toMatchObject({
    totalEntries: 2000,
    totalIgnoredPaths: 2000,
    truncated: true,
    hasMore: true,
    status: { branch: 'fixture', didHitLimit: true, statusLength: 4000 }
  })
  result.status.entries[0].path = 'changed'
  expect(controller.result(request.requestId, 0, 1).status.entries[0].path).toBe('0')
  expect(() => controller.result(request.requestId, 0, 501)).toThrow()
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 15 * 60 * 1000 + 1)
  expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
})
it('discards failure details, enforces the byte bound and requests deadline cancellation without claiming exit', async () => {
  const controller = create()
  let request = controller.start(async () => ({
    ...empty,
    entries: [{ path: 'x'.repeat(1024 * 1024 + 1), status: 'untracked', area: 'untracked' }]
  }))
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  expect(controller.result(request.requestId, 0, 100)).toMatchObject({
    totalEntries: 0,
    truncated: true
  })
  request = controller.start(async () => {
    throw new Error('private diagnostic')
  })
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('failed'))
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain('private')
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  let finish: ((result: GitStatusResult) => void) | undefined
  request = controller.start(async (s) => {
    signal = s
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  await vi.advanceTimersByTimeAsync(120000)
  expect(signal?.aborted).toBe(true)
  expect(controller.status(request.requestId)).toMatchObject({
    state: 'cancel_requested',
    executionVerdict: 'unverifiable'
  })
  finish?.(empty)
  await vi.advanceTimersByTimeAsync(0)
  expect(controller.status(request.requestId).state).toBe('cancelled')
})
