import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { buildRegistry, type RpcContext } from '../core'
import { DESKTOP_SUPPORT_METHODS } from './desktop-support'
import { DESKTOP_DIAGNOSTICS_METHODS } from './desktop-diagnostics'
import { DESKTOP_STAR_PROMPT_METHODS } from './desktop-star-prompt'
import { desktopAppTarget } from './desktop-app-target'

const fixture = vi.hoisted(() => ({
  progress: { closedAt: 0 },
  consent: { optedIn: false },
  upload: vi.fn(),
  star: vi.fn().mockResolvedValue(true)
}))
vi.mock('../../orca-runtime', () => ({
  OrcaRuntimeService: class {
    getRuntimeId() {
      return 'support-fixture'
    }
    getStatus() {
      return { desktopWindowStatus: 'available' }
    }
  }
}))
vi.mock('../../../ipc/onboarding', () => ({
  getOnboardingOperations: () => ({
    get: () => fixture.progress,
    update: (input: typeof fixture.progress) => {
      fixture.progress = input
      return fixture.progress
    }
  })
}))
vi.mock('../../../ipc/telemetry', () => ({
  getTelemetryOperations: () => ({
    getConsentState: () => fixture.consent,
    setOptIn: (optedIn: boolean) => {
      fixture.consent = { optedIn }
    }
  })
}))
vi.mock('../../../ipc/diagnostics', () => ({ sendReviewedDiagnosticBundle: fixture.upload }))
vi.mock('../../../star-nag/cli-operations', () => ({
  getStarNagCliOperations: () => ({ star: fixture.star })
}))
const context = { runtime: OrcaRuntimeService.prototype }
const registry = buildRegistry([
  ...DESKTOP_SUPPORT_METHODS,
  ...DESKTOP_DIAGNOSTICS_METHODS,
  ...DESKTOP_STAR_PROMPT_METHODS
])
async function invoke(
  name: string,
  input: unknown,
  caller: RpcContext = context
): Promise<unknown> {
  const method = registry.get(name)
  if (!method || 'stream' in method) {
    throw new Error('Missing method')
  }
  return method.handler(method.params ? method.params.parse(input) : undefined, caller)
}
beforeEach(() => {
  Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
})
afterEach(() => {
  Reflect.deleteProperty(process.versions, 'electron')
  vi.clearAllMocks()
})
it('writes onboarding progress and returns the service readback', async () => {
  await invoke('desktopOnboarding.update', { closedAt: 12345 })
  expect(await invoke('desktopOnboarding.get', undefined)).toEqual({ closedAt: 12345 })
  await expect(invoke('desktopOnboarding.update', { arbitraryCode: 'no' })).rejects.toThrow()
})
it('returns effective telemetry consent after changing it', async () => {
  expect(await invoke('desktopTelemetry.setOptIn', { optedIn: true })).toEqual({ optedIn: true })
  expect(await invoke('desktopTelemetry.getConsentState', undefined)).toEqual({ optedIn: true })
})
it('refuses a diagnostic confirmation for a different retained payload', async () => {
  await expect(
    invoke('desktopDiagnostics.uploadBundle', {
      bundleSubmissionId: 'fixtureabcdefghijklmnop',
      confirmSubmissionId: 'anotherabcdefghijklmnop'
    })
  ).rejects.toThrow(/exact/)
  expect(fixture.upload).not.toHaveBeenCalled()
  await invoke('desktopDiagnostics.uploadBundle', {
    bundleSubmissionId: 'fixtureabcdefghijklmnop',
    confirmSubmissionId: 'fixtureabcdefghijklmnop'
  })
  expect(fixture.upload).toHaveBeenCalledWith('fixtureabcdefghijklmnop')
})
it('requires the exact running app before using its account to star', async () => {
  await expect(
    invoke('desktopStarPrompt.control', { action: 'star', confirmTarget: 'stale-app' })
  ).rejects.toMatchObject({ code: 'target_mismatch' })
  expect(fixture.star).not.toHaveBeenCalled()
  expect(
    await invoke('desktopStarPrompt.control', {
      action: 'star',
      confirmTarget: desktopAppTarget(context)
    })
  ).toEqual({ starred: true })
})
it('does not allow a mobile connection to mutate desktop support state', async () => {
  await expect(
    invoke('desktopTelemetry.setOptIn', { optedIn: true }, { ...context, clientKind: 'mobile' })
  ).rejects.toMatchObject({ code: 'forbidden' })
})
