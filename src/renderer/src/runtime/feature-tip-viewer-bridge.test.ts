import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  bumpProviderRuntimeSessionGeneration,
  getProviderRuntimeContextKey
} from '@/lib/provider-runtime-context'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'
import type { FeatureTipId } from '../../../shared/feature-tips'
import type { FeatureTipControl } from './feature-tip-viewer-view'

type Published = { open: boolean; tipId: FeatureTipId | null; action: string | null }
const fixture = vi.hoisted(() => {
  const noControl = (): FeatureTipControl | null => null
  const noView = (): Published | null => null
  const noSeen = (): FeatureTipId[] => []
  const noTimers = (): ReturnType<typeof setTimeout>[] => []
  const noRuntimeEnvironment = (): string | null => null
  return {
    state: {
      settings: { activeRuntimeEnvironmentId: noRuntimeEnvironment() },
      persistedUIReady: true,
      activeModal: 'feature-tips'
    },
    viewKey: noRuntimeEnvironment(),
    view: noView(),
    control: noControl(),
    seen: noSeen(),
    timers: noTimers()
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./feature-tip-viewer-view', () => ({
  readFeatureTipView: () =>
    fixture.view
      ? {
          runtimeContextKey:
            fixture.viewKey ?? getProviderRuntimeContextKey(fixture.state.settings),
          ...fixture.view
        }
      : null,
  readFeatureTipControl: () => (fixture.view?.open ? fixture.control : null)
}))
import { applyFeatureTipRequest } from './feature-tip-viewer-bridge'
import type { FeatureTipViewerCommand } from '../../../shared/rpc-contract/feature-tip-viewer-params'

const host = { viewer: 'host' } as const
const request = (command: FeatureTipViewerCommand, validForMs = 9000) => ({
  id: 'r',
  expiresAt: Date.now() + validForMs,
  command
})
const open = (tipId: FeatureTipId): Published => ({
  open: true,
  tipId,
  action: 'learn-cmd-j-palette'
})
const closed: Published = { open: false, tipId: null, action: null }
// Mirrors the modal: the tip closes at once, the host write follows (or never lands).
const skipControl = (hostWrites = true): FeatureTipControl => ({
  skip: vi.fn(() => {
    const tipId = fixture.view?.tipId
    fixture.view = closed
    if (hostWrites && tipId) {
      fixture.timers.push(
        setTimeout(() => {
          fixture.seen = [...fixture.seen, tipId]
        }, 0)
      )
    }
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  // A write the test never waited for must not land in the next test.
  fixture.timers.splice(0).forEach(clearTimeout)
})
beforeEach(() => {
  Object.assign(fixture.state, {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    activeModal: 'feature-tips'
  })
  Object.assign(fixture, {
    view: open('cmd-j-palette'),
    control: skipControl(),
    seen: [],
    viewKey: null
  })
  vi.stubGlobal('window', {
    api: { ui: { get: vi.fn(async () => makePersistedUI({ featureTipsSeenIds: fixture.seen })) } }
  })
})

it('reads the open tip without touching it, and reports no tip when none is mounted', async () => {
  expect(await applyFeatureTipRequest(request({ ...host, operation: 'get' }))).toMatchObject({
    dispatched: false,
    applied: true,
    persisted: null,
    writeOutcome: 'not_requested',
    tipId: 'cmd-j-palette',
    open: true,
    rendered: { open: true, tipId: 'cmd-j-palette', action: 'learn-cmd-j-palette' }
  })
  expect(fixture.control?.skip).not.toHaveBeenCalled()
  fixture.view = null
  expect(await applyFeatureTipRequest(request({ ...host, operation: 'get' }))).toMatchObject({
    applied: true,
    tipId: null,
    open: false,
    rendered: { open: false, tipId: null, action: null }
  })
})
it('skips the open tip through the published control and reads the host seen list back', async () => {
  const result = await applyFeatureTipRequest(request({ ...host, operation: 'skip' }))
  expect(fixture.control?.skip).toHaveBeenCalledOnce()
  expect(result).toMatchObject({
    dispatched: true,
    applied: true,
    persisted: true,
    writeOutcome: 'unknown',
    tipId: 'cmd-j-palette',
    open: false
  })
  expect(result.reason).toBeUndefined()
})
it('skips only the tip it was asked about', async () => {
  const result = await applyFeatureTipRequest(
    request({ ...host, operation: 'skip', tipId: 'cmd-j-palette' })
  )
  expect(result).toMatchObject({ applied: true, persisted: true })
  fixture.view = open('orca-cli')
  fixture.control = skipControl()
  await expect(
    applyFeatureTipRequest(request({ ...host, operation: 'skip', tipId: 'cmd-j-palette' }))
  ).rejects.toThrow('feature_tip_mismatch')
  expect(fixture.control.skip).not.toHaveBeenCalled()
})
it('refuses to skip when no tip is open or the control is not mounted', async () => {
  fixture.view = closed
  await expect(applyFeatureTipRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'feature_tip_unavailable'
  )
  fixture.view = null
  await expect(applyFeatureTipRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'feature_tip_unavailable'
  )
  expect(fixture.control?.skip).not.toHaveBeenCalled()
})
it('confirms a tip that was already recorded as seen', async () => {
  fixture.seen = ['cmd-j-palette']
  expect(await applyFeatureTipRequest(request({ ...host, operation: 'skip' }))).toMatchObject({
    applied: true,
    persisted: true
  })
})
// Fake clock: the read budget runs out without a real wait, and no host stall can flip applied.
const skipWithin = async (validForMs: number) => {
  vi.useFakeTimers()
  const pending = applyFeatureTipRequest(request({ ...host, operation: 'skip' }, validForMs))
  await vi.advanceTimersByTimeAsync(validForMs)
  return pending
}
it('does not claim persistence the host never shows, or a read that never answers', async () => {
  fixture.control = skipControl(false)
  expect(await skipWithin(700)).toMatchObject({
    applied: true,
    persisted: false,
    reason: 'persistence_superseded'
  })
  vi.useRealTimers()
  fixture.view = open('cmd-j-palette')
  fixture.control = skipControl()
  vi.mocked(window.api.ui.get).mockImplementation(() => new Promise<never>(() => undefined))
  expect(await skipWithin(700)).toMatchObject({
    applied: true,
    persisted: null,
    reason: 'persistence_unverifiable'
  })
})
it('reports a tip that stays open as not applied', async () => {
  fixture.control = { skip: vi.fn() }
  expect(await skipWithin(700)).toMatchObject({
    dispatched: true,
    applied: false,
    open: true,
    reason: 'feature_tip_still_open'
  })
})
it('refuses to close a different modal that opened after the tip view was published', async () => {
  fixture.state.activeModal = 'settings'
  await expect(applyFeatureTipRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'feature_tip_unavailable'
  )
  expect(fixture.control?.skip).not.toHaveBeenCalled()
})
it('ignores a tip view published under another runtime', async () => {
  fixture.viewKey = 'other#9'
  expect(await applyFeatureTipRequest(request({ ...host, operation: 'get' }))).toMatchObject({
    tipId: null,
    open: false,
    rendered: { open: false, tipId: null }
  })
  await expect(applyFeatureTipRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'feature_tip_unavailable'
  )
  expect(fixture.control?.skip).not.toHaveBeenCalled()
})
it('treats another tip taking its place as the skipped tip closing', async () => {
  fixture.control = {
    skip: vi.fn(() => {
      fixture.view = open('orca-cli')
      fixture.timers.push(
        setTimeout(() => {
          fixture.seen = ['cmd-j-palette']
        }, 0)
      )
    })
  }
  expect(await applyFeatureTipRequest(request({ ...host, operation: 'skip' }))).toMatchObject({
    applied: true,
    persisted: true,
    tipId: 'cmd-j-palette',
    open: true,
    rendered: { tipId: 'orca-cli' }
  })
})
it('fences the runtime: not ready, other runtime, and a runtime that changes during the read', async () => {
  fixture.state.persistedUIReady = false
  await expect(applyFeatureTipRequest(request({ ...host, operation: 'get' }))).rejects.toThrow(
    'viewer_not_ready'
  )
  fixture.state.persistedUIReady = true
  fixture.state.settings = { activeRuntimeEnvironmentId: 'remote' }
  await expect(applyFeatureTipRequest(request({ ...host, operation: 'get' }))).rejects.toThrow(
    'viewer_runtime_mismatch'
  )
  fixture.state.settings = { activeRuntimeEnvironmentId: null }
  vi.mocked(window.api.ui.get).mockImplementationOnce(async () => {
    bumpProviderRuntimeSessionGeneration()
    return makePersistedUI({ featureTipsSeenIds: ['cmd-j-palette'] })
  })
  expect(await applyFeatureTipRequest(request({ ...host, operation: 'skip' }))).toMatchObject({
    applied: false,
    persisted: null,
    rendered: null,
    reason: 'viewer_runtime_changed'
  })
})
it('rejects an expired request without touching the tip', async () => {
  await expect(
    applyFeatureTipRequest({ ...request({ ...host, operation: 'skip' }), expiresAt: 1 })
  ).rejects.toThrow('request_expired')
  expect(fixture.control?.skip).not.toHaveBeenCalled()
})
