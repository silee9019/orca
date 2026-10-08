import { afterEach, expect, it, vi } from 'vitest'
import { DesktopFileSearchController } from './desktop-file-search-controller'
import type { SearchResult } from '../shared/code-search-types'
const result: SearchResult = {
  files: [
    {
      filePath: '/fixture/a',
      relativePath: 'a',
      matches: [{ line: 1, column: 1, matchLength: 1, lineContent: 'a' }]
    }
  ],
  totalMatches: 1,
  truncated: false
}
let controller = new DesktopFileSearchController()
afterEach(() => {
  controller.dispose()
  controller = new DesktopFileSearchController()
  vi.useRealTimers()
})
it('propagates the owned abort, keeps the slot until settlement and discards late matches', async () => {
  let finish: (value: SearchResult) => void = () => {}
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
  expect(() => controller.start(async () => result, 10)).toThrow('desktop_file_search_busy')
  finish(result)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('cancelled'))
  expect(() => controller.result(request.requestId, 0, 1)).toThrow()
})
it('caps retained matches/bytes, returns copies and expires terminal results', async () => {
  let request = controller.start(
    async () => ({
      ...result,
      files: [
        { ...result.files[0], matches: [...result.files[0].matches, ...result.files[0].matches] }
      ],
      totalMatches: 2
    }),
    1
  )
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  expect(controller.result(request.requestId, 0, 1)).toMatchObject({
    totalMatches: 1,
    sourceTotalMatches: 2,
    truncated: true
  })
  const page = controller.result(request.requestId, 0, 1)
  page.files[0].matches[0].lineContent = 'changed'
  expect(controller.result(request.requestId, 0, 1).files[0].matches[0].lineContent).toBe('a')
  request = controller.start(
    async () => ({
      ...result,
      files: [
        {
          ...result.files[0],
          matches: [{ ...result.files[0].matches[0], lineContent: 'x'.repeat(1024 * 1024) }]
        }
      ]
    }),
    10
  )
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  expect(controller.result(request.requestId, 0, 1)).toMatchObject({
    totalFiles: 0,
    truncated: true
  })
  vi.useFakeTimers()
  request = controller.start(async () => result, 10)
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
  expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
})
it('discards source failures and rejects invalid page/limit requests', async () => {
  expect(() => controller.start(async () => result, 2001)).toThrow()
  let request = controller.start(async () => {
    throw new Error('private-token')
  }, 10)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('failed'))
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain('private-token')
  request = controller.start(async () => result, 10)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  expect(() => controller.result(request.requestId, 0, 501)).toThrow()
})
