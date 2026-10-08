import { afterEach, expect, it, vi } from 'vitest'
import type { FeatureTourRequest } from '../../../shared/feature-tour-command'
import { applyFeatureTourRequest } from './feature-tour-command'
import { attachFeatureTourBridge } from './use-feature-tour-bridge'
vi.mock('./feature-tour-command', () => ({ applyFeatureTourRequest: vi.fn() }))
afterEach(() => vi.clearAllMocks())
it('revokes the request root lease across availability return and disposal', async () => {
  let receive: ((request: FeatureTourRequest) => void) | undefined
  let release: (() => void) | undefined
  let check: (() => boolean) | undefined
  let generation = 0
  vi.mocked(applyFeatureTourRequest).mockImplementation(async (_request, available) => {
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
      workflowId: null,
      reason: 'viewer_surface_superseded'
    }
  })
  const respondFeatureTour = vi.fn()
  const unsubscribe = vi.fn()
  const dispose = attachFeatureTourBridge(
    {
      onFeatureTourRequest: (callback) => {
        receive = callback
        return unsubscribe
      },
      respondFeatureTour
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
  await vi.waitFor(() => expect(applyFeatureTourRequest).toHaveBeenCalledTimes(1))
  expect(respondFeatureTour).not.toHaveBeenCalled()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
it('keeps old preload bridges inert', () => {
  const dispose = attachFeatureTourBridge({}, () => true)
  dispose()
  expect(applyFeatureTourRequest).not.toHaveBeenCalled()
})
