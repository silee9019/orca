import { afterEach, expect, it, vi } from 'vitest'
import { DesktopRepositoryCloneController } from './desktop-repository-clone-controller'
const receipt = {
  repoId: 'fixture',
  path: '/fixture',
  executionHostId: 'ssh:fixture',
  kind: 'git' as const
}
let controller: DesktopRepositoryCloneController | undefined
afterEach(() => {
  controller?.dispose()
  vi.useRealTimers()
})
it('holds the slot until cancelled work settles and discards late progress and receipts', async () => {
  controller = new DesktopRepositoryCloneController()
  let progress: ((value: { phase: string; percent: number }) => void) | undefined
  let finish: ((value: typeof receipt) => void) | undefined
  let signal: AbortSignal | undefined
  const request = controller.start(async (abort, onProgress) => {
    signal = abort.signal
    progress = onProgress
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  await vi.waitFor(() => expect(finish).toBeDefined())
  progress?.({ phase: 'private URL', percent: 42.9 })
  for (const percent of [Number.NaN, Infinity, -1, 101]) {
    progress?.({ phase: 'secret', percent })
  }
  expect(controller.status(request.requestId)).toMatchObject({
    percent: 42,
    executionVerdict: 'unverifiable'
  })
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain('private URL')
  expect(controller.cancel(request.requestId).state).toBe('cancel_requested')
  expect(signal?.aborted).toBe(true)
  expect(() => controller?.start(async () => receipt)).toThrow('desktop_remote_clone_busy')
  progress?.({ phase: 'late', percent: 100 })
  finish?.(receipt)
  await vi.waitFor(() => expect(controller?.status(request.requestId).state).toBe('cancelled'))
  expect(controller.status(request.requestId).percent).toBe(42)
  expect(() => controller?.result(request.requestId)).toThrow()
  const replacement = controller.start(async () => receipt)
  expect(() => controller?.status(request.requestId)).toThrow('selector_not_found')
  await vi.waitFor(() => expect(controller?.status(replacement.requestId).state).toBe('completed'))
})
it('copies completed receipts, rejects unrelated handles, and drops callbacks after completion', async () => {
  controller = new DesktopRepositoryCloneController()
  let progress: ((value: { phase: string; percent: number }) => void) | undefined
  const request = controller.start(async (_abort, onProgress) => {
    progress = onProgress
    return receipt
  })
  await vi.waitFor(() => expect(controller?.status(request.requestId).state).toBe('completed'))
  const result = controller.result(request.requestId)
  result.path = '/changed'
  expect(controller.result(request.requestId).path).toBe('/fixture')
  progress?.({ phase: 'late', percent: 99 })
  expect(controller.status(request.requestId).percent).toBeNull()
  expect(() => controller?.cancel('foreign')).toThrow('selector_not_found')
  expect(controller.cancel(request.requestId).state).toBe('cancelled')
  expect(() => controller?.result(request.requestId)).toThrow()
})
it('expires settled metadata after fifteen minutes and suppresses raw failure details', async () => {
  vi.useFakeTimers()
  controller = new DesktopRepositoryCloneController()
  const request = controller.start(async () => {
    throw new Error('private credential')
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(controller.status(request.requestId).state).toBe('failed')
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain('private credential')
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
  expect(() => controller?.status(request.requestId)).toThrow('selector_not_found')
})
