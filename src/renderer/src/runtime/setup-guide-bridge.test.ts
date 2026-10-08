import { afterEach, expect, it, vi } from 'vitest'
import type { SetupGuideRequest } from '../../../shared/setup-guide-command'
import { applySetupGuideRequest } from './setup-guide-command'
import { attachSetupGuideBridge } from './use-setup-guide-bridge'
vi.mock('./setup-guide-command', () => ({ applySetupGuideRequest: vi.fn() }))
afterEach(() => vi.clearAllMocks())
it('revokes the request root lease across availability return and disposal', async () => {
  let receive: ((request: SetupGuideRequest) => void) | undefined
  let release: (() => void) | undefined
  let check: (() => boolean) | undefined
  let generation = 0
  vi.mocked(applySetupGuideRequest).mockImplementation(async (_request, available) => {
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
      stepId: null,
      reason: 'viewer_surface_superseded'
    }
  })
  const respondSetupGuide = vi.fn()
  const unsubscribe = vi.fn()
  const dispose = attachSetupGuideBridge(
    {
      onSetupGuideRequest: (callback) => {
        receive = callback
        return unsubscribe
      },
      respondSetupGuide
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
  await vi.waitFor(() => expect(applySetupGuideRequest).toHaveBeenCalledTimes(1))
  expect(respondSetupGuide).not.toHaveBeenCalled()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
it('keeps old preload bridges inert', () => {
  const dispose = attachSetupGuideBridge({}, () => true)
  dispose()
  expect(applySetupGuideRequest).not.toHaveBeenCalled()
})
