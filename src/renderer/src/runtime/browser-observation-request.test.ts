// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../shared/constants'
import { registerBrowserStateIpcBridge } from '@/hooks/ipc-events/browser-state-ipc-bridge'
import { registerMobileDriverIpcBridge } from '@/hooks/ipc-events/mobile-driver-ipc-bridge'
import { installBrowserObservationApi } from './browser-observation-api.test-fixture'
import { hydrateBrowserDrivers } from '@/lib/pane-manager/browser-mobile-driver-state'
import { requestBrowserObservation } from './browser-observation-request'
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    cleanup()
  }
  hydrateBrowserDrivers([])
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function seed() {
  installBrowserObservationApi()
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: 'folder:fixture'
  })
  useAppStore
    .getState()
    .createBrowserTab('folder:fixture', 'about:blank', { browserPageId: 'page' })
}
const target = {
  page: 'page',
  worktreeId: 'folder:fixture',
  kind: 'visibility',
  waitMs: 0
} as const
it('observes actual activation visibility and capture hold releases within the IPC bridge lifetime', async () => {
  seed()
  registerBrowserStateIpcBridge(cleanups, () => false)
  expect(await requestBrowserObservation(target, Date.now() + 9000)).toMatchObject({
    automationVisible: false,
    changed: false
  })
  const wait = requestBrowserObservation({ ...target, waitMs: 1000 }, Date.now() + 9000)
  const subscribed = vi.mocked(window.api.browser.onCapturePaintHold).mock.calls[0]?.[0]
  if (!subscribed) {
    throw new Error('missing actual capture subscription')
  }
  subscribed({ browserPageId: 'page', held: true })
  expect(await wait).toMatchObject({ automationVisible: true, changed: true })
  subscribed({ browserPageId: 'page', held: false })
  expect(await requestBrowserObservation(target, Date.now() + 9000)).toMatchObject({
    automationVisible: false
  })
  vi.useFakeTimers()
  const activate = vi.mocked(window.api.browser.onActivateView).mock.calls[0]?.[0]
  if (!activate) {
    throw new Error('missing actual activation subscription')
  }
  activate({ worktreeId: 'folder:fixture', browserPageId: 'page' })
  expect(await requestBrowserObservation(target, Date.now() + 9000)).toMatchObject({
    automationVisible: true
  })
  await vi.advanceTimersByTimeAsync(10000)
  expect(await requestBrowserObservation(target, Date.now() + 9000)).toMatchObject({
    automationVisible: false
  })
})
it('rejects waits on bridge disposal and rejects stale lifetime requests', async () => {
  seed()
  registerBrowserStateIpcBridge(cleanups, () => false)
  const pending = requestBrowserObservation({ ...target, waitMs: 5000 }, Date.now() + 9000)
  const rejected = expect(pending).rejects.toThrow('disposed')
  for (const dispose of cleanups.splice(0)) {
    dispose()
  }
  await rejected
  await expect(requestBrowserObservation(target, Date.now() + 9000)).rejects.toThrow('unavailable')
})
it('times out unchanged and refuses expired, wrong workspace and paired target observations', async () => {
  seed()
  registerBrowserStateIpcBridge(cleanups, () => false)
  vi.useFakeTimers()
  const pending = requestBrowserObservation({ ...target, waitMs: 5000 }, Date.now() + 9000)
  await vi.advanceTimersByTimeAsync(5000)
  expect(await pending).toMatchObject({ changed: false, automationVisible: false })
  await expect(requestBrowserObservation(target, Date.now())).rejects.toThrow('expired')
  await expect(
    requestBrowserObservation({ ...target, worktreeId: 'other' }, Date.now() + 9000)
  ).rejects.toThrow('target')
  useAppStore
    .getState()
    .setRemoteBrowserPageHandle('page', { environmentId: 'paired', remotePageId: 'remote' })
  await expect(requestBrowserObservation(target, Date.now() + 9000)).rejects.toThrow('target')
})
it('does not treat an unhydrated driver default as an authoritative idle snapshot', async () => {
  seed()
  let settle = () => {}
  const gate = new Promise<[]>((resolve) => {
    settle = () => resolve([])
  })
  vi.spyOn(window.api.runtime, 'getBrowserDrivers').mockReturnValue(gate)
  const dispose = registerMobileDriverIpcBridge(cleanups, () => false)
  cleanups.push(dispose)
  const driver = { ...target, kind: 'driver' } as const
  await expect(requestBrowserObservation(driver, Date.now() + 9000)).rejects.toThrow('not_ready')
  settle()
  await gate
  await Promise.resolve()
  await Promise.resolve()
  expect(await requestBrowserObservation(driver, Date.now() + 9000)).toMatchObject({
    driver: { kind: 'idle' }
  })
  const wait = requestBrowserObservation({ ...driver, waitMs: 1000 }, Date.now() + 9000)
  const subscribed = vi.mocked(window.api.runtime.onBrowserDriverChanged).mock.calls[0]?.[0]
  if (!subscribed) {
    throw new Error('missing driver subscription')
  }
  subscribed({ browserPageId: 'page', driver: { kind: 'desktop' } })
  expect(await wait).toMatchObject({ changed: true, driver: { kind: 'desktop' } })
})

it('rejects a wait when its page is replaced by a paired owner and does not retain a stale subscription', async () => {
  seed()
  registerBrowserStateIpcBridge(cleanups, () => false)
  const pending = requestBrowserObservation({ ...target, waitMs: 5000 }, Date.now() + 9000)
  const rejected = expect(pending).rejects.toThrow('target_changed')
  useAppStore
    .getState()
    .setRemoteBrowserPageHandle('page', { environmentId: 'paired', remotePageId: 'remote' })
  await rejected
})
it('rejects expiry before the bounded wait and ambiguous active bridge instances', async () => {
  seed()
  registerBrowserStateIpcBridge(cleanups, () => false)
  vi.useFakeTimers()
  const pending = requestBrowserObservation({ ...target, waitMs: 5000 }, Date.now() + 20)
  const rejected = expect(pending).rejects.toThrow('expired')
  await vi.advanceTimersByTimeAsync(20)
  await rejected
  registerBrowserStateIpcBridge(cleanups, () => false)
  await expect(requestBrowserObservation(target, Date.now() + 9000)).rejects.toThrow('ambiguous')
})
it('refuses driver snapshots after failed hydration and bridge disposal', async () => {
  seed()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(window.api.runtime, 'getBrowserDrivers').mockRejectedValue(
    new Error('old_snapshot_unavailable')
  )
  const dispose = registerMobileDriverIpcBridge(cleanups, () => false)
  cleanups.push(dispose)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await expect(
    requestBrowserObservation({ ...target, kind: 'driver' }, Date.now() + 9000)
  ).rejects.toThrow('not_ready')
  dispose()
  await expect(
    requestBrowserObservation({ ...target, kind: 'driver' }, Date.now() + 9000)
  ).rejects.toThrow('unavailable')
})

it('disposes before releasing live capture holds in the app lifetime unsubscribe order', async () => {
  seed()
  registerBrowserStateIpcBridge(cleanups, () => false)
  const capture = vi.mocked(window.api.browser.onCapturePaintHold).mock.calls[0]?.[0]
  if (!capture) {
    throw new Error('missing actual capture subscription')
  }
  capture({ browserPageId: 'page', held: true })
  const wait = requestBrowserObservation({ ...target, waitMs: 5000 }, Date.now() + 9000)
  const rejected = expect(wait).rejects.toThrow('disposed')
  for (const dispose of cleanups.splice(0)) {
    dispose()
  }
  await rejected
})
