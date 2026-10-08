import { afterEach, expect, it, vi } from 'vitest'
import type { WorkspaceSpaceAnalysis } from '../shared/workspace-space-types'
vi.mock('./workspace-space-analysis', () => ({
  WorkspaceSpaceScanCancelledError: class extends Error {}
}))
import { WorkspaceSpaceScanController } from './workspace-space-scan-controller'
import { WorkspaceSpaceScanCancelledError } from './workspace-space-analysis'
const controllers: WorkspaceSpaceScanController[] = []
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.disposeCli())
  vi.useRealTimers()
})
function analysis(): WorkspaceSpaceAnalysis {
  return {
    scannedAt: 1,
    totalSizeBytes: 0,
    reclaimableBytes: 0,
    worktreeCount: 0,
    scannedWorktreeCount: 0,
    unavailableWorktreeCount: 0,
    repos: [],
    worktrees: []
  }
}
function fixture() {
  let resolve: (value: WorkspaceSpaceAnalysis) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const pending = new Promise<WorkspaceSpaceAnalysis>((yes, no) => {
    resolve = yes
    reject = no
  })
  const scan = vi.fn().mockReturnValue(pending)
  const persist = vi.fn()
  const controller = new WorkspaceSpaceScanController(scan, persist)
  controllers.push(controller)
  return { controller, scan, persist, resolve, reject }
}
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
}
it('coalesces renderer requests and refuses CLI cancellation or a competing scan', async () => {
  const { controller, scan, resolve } = fixture()
  const first = controller.analyzeForRenderer(vi.fn())
  const second = controller.analyzeForRenderer(vi.fn())
  expect(scan).toHaveBeenCalledOnce()
  expect(() => controller.startCli()).toThrow(/busy/)
  expect(() => controller.cancelCli('not-owned')).toThrow(/selector_not_found/)
  expect(controller.cancelForRenderer()).toBe(true)
  expect(controller.cancelForRenderer()).toBe(false)
  expect(scan.mock.calls[0][0].signal.aborted).toBe(true)
  resolve(analysis())
  await expect(first).resolves.toEqual({ ok: false, cancelled: true })
  await expect(second).resolves.toEqual({ ok: false, cancelled: true })
})
it('keeps cancelled CLI work active until settlement and discards late analysis without persisting it', async () => {
  const { controller, scan, persist, resolve } = fixture()
  const request = controller.startCli()
  expect(controller.cancelForRenderer()).toBe(false)
  expect(() => controller.analyzeForRenderer(vi.fn())).toThrow(/busy/)
  expect(controller.cancelCli(request.requestId).state).toBe('cancel_requested')
  expect(scan.mock.calls[0][0].signal.aborted).toBe(true)
  expect(() => controller.startCli()).toThrow(/busy/)
  resolve(analysis())
  await settle()
  expect(controller.status(request.requestId).state).toBe('cancelled')
  expect(() => controller.result(request.requestId, 0, 0, 10)).toThrow()
  expect(persist).not.toHaveBeenCalled()
})
it('retains one completed analysis, paginates rows and expires the result after fifteen minutes', async () => {
  vi.useFakeTimers()
  const { controller, resolve, persist } = fixture()
  const request = controller.startCli()
  const value = analysis()
  value.repos = Array.from({ length: 3 }, (_, index) => ({
    repoId: String(index),
    displayName: 'fixture',
    path: '/fixture',
    isRemote: false,
    worktreeCount: 0,
    scannedWorktreeCount: 0,
    unavailableWorktreeCount: 1,
    totalSizeBytes: 0,
    reclaimableBytes: 0,
    error: 'private diagnostic'
  }))
  resolve(value)
  await settle()
  expect(controller.status(request.requestId).state).toBe('completed')
  const result = controller.result(request.requestId, 1, 0, 1)
  expect(result.repos).toHaveLength(1)
  expect(result.repos[0].repoId).toBe('1')
  expect(result.repos[0].error).not.toContain('private')
  expect(result.repoTotal).toBe(3)
  expect(persist).toHaveBeenCalledWith(value)
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
  expect(() => controller.status(request.requestId)).toThrow(/selector_not_found/)
})
it('records expected cancellation and failures without claiming a completed result', async () => {
  const cancelled = fixture()
  const first = cancelled.controller.startCli()
  cancelled.reject(new WorkspaceSpaceScanCancelledError())
  await settle()
  expect(cancelled.controller.status(first.requestId).state).toBe('cancelled')
  const failed = fixture()
  const second = failed.controller.startCli()
  failed.reject(new Error('private'))
  await settle()
  expect(failed.controller.status(second.requestId).state).toBe('failed')
  expect(() => failed.controller.result(second.requestId, 0, 0, 10)).toThrow()
})
it('allows a new renderer scan without letting a previous CLI result cancellation abort it', async () => {
  const { controller, resolve, scan } = fixture()
  const request = controller.startCli()
  resolve(analysis())
  await settle()
  scan.mockReturnValue(new Promise(() => {}))
  void controller.analyzeForRenderer(vi.fn())
  controller.cancelCli(request.requestId)
  expect(scan.mock.calls[1][0].signal.aborted).toBe(false)
  controller.cancelForRenderer()
})

it('releases the execution slot when the analyzer throws before returning a promise', async () => {
  const { controller, scan } = fixture()
  scan.mockImplementationOnce(() => {
    throw new Error('fixture startup failure')
  })
  expect(() => controller.startCli()).toThrow(/startup failure/)
  scan.mockResolvedValue(analysis())
  const request = controller.startCli()
  await settle()
  expect(controller.status(request.requestId).state).toBe('completed')
})
