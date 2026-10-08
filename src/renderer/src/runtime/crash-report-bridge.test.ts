import { afterEach, expect, it, vi } from 'vitest'
import type { CrashReportRequest } from '../../../shared/crash-report-command'
import { applyCrashReportRequest } from './crash-report-command'
import { attachCrashReportBridge } from './use-crash-report-bridge'
vi.mock('./crash-report-command', () => ({ applyCrashReportRequest: vi.fn() }))
afterEach(() => vi.clearAllMocks())
it('revokes the request root lease across availability return and disposal', async () => {
  let receive: ((request: CrashReportRequest) => void) | undefined
  let release: (() => void) | undefined
  let check: (() => boolean) | undefined
  let generation = 0
  vi.mocked(applyCrashReportRequest).mockImplementation(async (_request, available) => {
    check = available
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return {
      viewer: 'host',
      applied: false,
      source: 'help_menu',
      dialogPresent: false,
      contentPresent: false,
      contentState: null,
      reason: 'viewer_surface_superseded'
    }
  })
  const respondCrashReport = vi.fn()
  const unsubscribe = vi.fn()
  const dispose = attachCrashReportBridge(
    {
      onCrashReportRequest: (callback) => {
        receive = callback
        return unsubscribe
      },
      respondCrashReport
    },
    () => true,
    () => generation
  )
  const request = {
    id: 'first',
    expiresAt: Date.now() + 9000,
    command: { viewer: 'host' as const, operation: 'open' as const }
  }
  if (!receive) {
    throw new Error('missing subscription')
  }
  receive(request)
  receive({ ...request, id: 'queued' })
  await vi.waitFor(() => expect(check).toBeDefined())
  expect(check?.()).toBe(true)
  generation = 2
  expect(check?.()).toBe(false)
  dispose()
  expect(check?.()).toBe(false)
  if (!release) {
    throw new Error('missing in-flight request')
  }
  release()
  await vi.waitFor(() => expect(applyCrashReportRequest).toHaveBeenCalledTimes(1))
  expect(respondCrashReport).not.toHaveBeenCalled()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
it('keeps old preload bridges inert', () => {
  const dispose = attachCrashReportBridge({}, () => true)
  dispose()
  expect(applyCrashReportRequest).not.toHaveBeenCalled()
})
