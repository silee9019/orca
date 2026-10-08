import { afterEach, expect, it, vi } from 'vitest'
import { DesktopFileListController } from './desktop-file-list-controller'
let controller = new DesktopFileListController()
afterEach(() => {
  controller.dispose()
  controller = new DesktopFileListController()
  vi.useRealTimers()
})
it('retains the slot until the original promise settles after cancellation and discards late results', async () => {
  let finish: (files: string[]) => void = () => {}
  let signal: AbortSignal | undefined
  const request = controller.start(async (value) => {
    signal = value
    return new Promise((resolve) => {
      finish = resolve
    })
  }, 10)
  await Promise.resolve()
  expect(controller.cancel(request.requestId).state).toBe('cancel_requested')
  expect(signal?.aborted).toBe(true)
  expect(() => controller.start(async () => [], 10)).toThrow('desktop_file_list_busy')
  finish(['must-not-leak.txt'])
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('cancelled'))
  expect(() => controller.result(request.requestId, 0, 10)).toThrow()
  const next = controller.start(async () => ['next.txt'], 10)
  await vi.waitFor(() => expect(controller.status(next.requestId).state).toBe('completed'))
  expect(() => controller.cancel(request.requestId)).toThrow('selector_not_found')
})
it('bounds retained results by rows and bytes, pages and expires without retaining raw failures', async () => {
  let request = controller.start(async () => ['a', 'b', 'c'], 2)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  expect(controller.result(request.requestId, 1, 1)).toMatchObject({
    total: 2,
    files: ['b'],
    truncated: true,
    hasMore: false
  })
  expect(() => controller.result(request.requestId, -1, 1)).toThrow()
  request = controller.start(async () => ['x'.repeat(1024 * 1024)], 2)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  expect(controller.result(request.requestId, 0, 1)).toMatchObject({ total: 0, truncated: true })
  vi.useFakeTimers()
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
  expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
  vi.useRealTimers()
  request = controller.start(async () => {
    throw new Error('secret fixture token')
  }, 2)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('failed'))
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain('secret')
})
