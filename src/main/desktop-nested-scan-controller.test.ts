import { afterEach, expect, it, vi } from 'vitest'
import { DesktopNestedScanController } from './desktop-nested-scan-controller'
import type { NestedRepoScanResult } from '../shared/project-group-types'
const scan: NestedRepoScanResult = {
  selectedPath: '/fixture',
  selectedPathKind: 'non_git_folder',
  repos: [{ path: '/fixture/repo', displayName: 'repo', depth: 1 }],
  truncated: false,
  timedOut: false,
  stopped: false,
  durationMs: 1,
  maxDepth: 4,
  maxRepos: 100,
  timeoutMs: 15000
}
let controller = new DesktopNestedScanController()
afterEach(() => {
  controller.dispose()
  controller = new DesktopNestedScanController()
  vi.useRealTimers()
})
it('records actual progress, aborts the owned signal, retains the slot until settlement and discards late results', async () => {
  let finish: (value: NestedRepoScanResult) => void = () => {}
  let signal: AbortSignal | undefined
  const request = controller.start(async (value, progress) => {
    signal = value
    progress(scan)
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  await Promise.resolve()
  expect(controller.status(request.requestId).progress).toMatchObject({
    repoCount: 1,
    durationMs: 1
  })
  expect(controller.cancel(request.requestId).state).toBe('cancel_requested')
  expect(signal?.aborted).toBe(true)
  expect(() => controller.start(async () => scan)).toThrow('desktop_nested_scan_busy')
  finish(scan)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('cancelled'))
  expect(() => controller.result(request.requestId, 0, 1)).toThrow()
  const next = controller.start(async () => scan)
  await vi.waitFor(() => expect(controller.status(next.requestId).state).toBe('completed'))
  expect(() => controller.cancel(request.requestId)).toThrow('selector_not_found')
})
it('limits retained bytes and rows, returns copies and expires terminal records', async () => {
  let request = controller.start(async () => ({
    ...scan,
    repos: Array.from({ length: 501 }, () => ({ ...scan.repos[0] }))
  }))
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  expect(controller.result(request.requestId, 499, 1)).toMatchObject({
    total: 500,
    summary: { truncated: true },
    hasMore: false
  })
  const page = controller.result(request.requestId, 0, 1)
  page.repos[0].path = 'changed'
  expect(controller.result(request.requestId, 0, 1).repos[0].path).toBe('/fixture/repo')
  request = controller.start(async () => ({
    ...scan,
    repos: [{ ...scan.repos[0], path: 'x'.repeat(1024 * 1024) }]
  }))
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('completed'))
  expect(controller.result(request.requestId, 0, 1)).toMatchObject({
    total: 0,
    summary: { truncated: true }
  })
  expect(() => controller.result(request.requestId, 0, 501)).toThrow()
  vi.useFakeTimers()
  request = controller.start(async () => scan)
  await vi.advanceTimersByTimeAsync(0)
  expect(controller.status(request.requestId).state).toBe('completed')
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
  expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
})
it('discards original diagnostics on failure', async () => {
  const request = controller.start(async () => {
    throw new Error('private failure token')
  })
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('failed'))
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain('private')
  expect(() => controller.result(request.requestId, 0, 1)).toThrow('No completed')
})
