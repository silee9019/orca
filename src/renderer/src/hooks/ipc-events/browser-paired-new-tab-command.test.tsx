// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  BrowserPairedNewTabEvent,
  requestBrowserPairedNewTab
} from '@/runtime/browser-paired-new-tab-request'
import { registerContentCreationIpcBridge } from './content-creation-ipc-bridge'
import {
  seedBrowserPairedNewTabOwner,
  publishBrowserPairedNewTabSnapshot
} from './browser-paired-new-tab.test-fixture'
import { pendingCreates } from '@/runtime/web-runtime-browser-creation-placement-test-rig'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import type * as SnapshotModule from '@/runtime/web-runtime-session-snapshot'
vi.mock('@/runtime/web-runtime-session', async () => ({
  createWebRuntimeSessionBrowserTab: (await import('@/runtime/web-runtime-browser-creation'))
    .createWebRuntimeSessionBrowserTab
}))
vi.mock('@/runtime/web-runtime-session-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof SnapshotModule>()),
  refreshWebRuntimeSessionTabsSnapshot: vi.fn(async (environmentId: string, worktree: string) =>
    publishBrowserPairedNewTabSnapshot(environmentId, worktree)
  )
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const initial = useAppStore.getInitialState()
const previous = Object.getOwnPropertyDescriptor(window, 'api')
let unsubs: (() => void)[] = []
function attach() {
  registerContentCreationIpcBridge(unsubs, () => true)
}
afterEach(() => {
  unsubs.forEach((dispose) => dispose())
  unsubs = []
  replaceRuntimeEnvironmentRevisions([])
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useAppStore.setState(initial, true)
  if (previous) {
    Object.defineProperty(window, 'api', previous)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it.each([true, false])(
  'uses actual content-creation lifetime and existing paired %s group/no-group owner',
  async (group) => {
    const { target, started } = seedBrowserPairedNewTabOwner(group)
    attach()
    const outcome = requestBrowserPairedNewTab(target, Date.now() + 5000)
    void outcome.catch(() => {})
    await Promise.race([started, outcome])
    expect(pendingCreates).toHaveLength(1)
    expect(pendingCreates[0].params.targetGroupId).toBe(target.group)
    pendingCreates[0].resolve('fixture-paired-new-page')
    await expect(outcome).resolves.toMatchObject({
      target,
      remotePageId: 'fixture-paired-new-page',
      materialized: true,
      guestRegistrationVerified: false
    })
  }
)
it.each([
  'host',
  'environment',
  'revision',
  'group',
  'expired',
  'modal',
  'old-capability'
] as const)('refuses %s before actual provider effect', async (reason) => {
  const { target, call } = seedBrowserPairedNewTabOwner()
  attach()
  if (reason === 'modal') {
    useAppStore.setState({ activeModal: 'add-repo' })
  }
  if (reason === 'old-capability') {
    useAppStore.setState({ runtimeStatusByEnvironmentId: new Map() })
  }
  const command = {
    ...target,
    ...(reason === 'host' ? { executionHostId: 'ssh:other' as const } : {}),
    ...(reason === 'environment' ? { environmentId: 'other' } : {}),
    ...(reason === 'revision' ? { pairingRevision: 8 } : {}),
    ...(reason === 'group' ? { group: 'other' } : {})
  }
  await expect(
    requestBrowserPairedNewTab(command, Date.now() + (reason === 'expired' ? -1 : 5000))
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  expect(pendingCreates).toHaveLength(0)
})
it('rejects active workspace ABA during cold creator loading before effects', async () => {
  const { target, call } = seedBrowserPairedNewTabOwner()
  attach()
  const outcome = requestBrowserPairedNewTab(target, Date.now() + 5000)
  useAppStore.setState({ activeWorktreeId: 'folder:other' })
  useAppStore.setState({ activeWorktreeId: target.worktree })
  await expect(outcome).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
it('rejects a captured offer after content lifetime cleanup', async () => {
  const { target, call } = seedBrowserPairedNewTabOwner()
  attach()
  const event = new BrowserPairedNewTabEvent(target, Date.now() + 5000)
  window.dispatchEvent(event)
  unsubs.forEach((dispose) => dispose())
  unsubs = []
  await expect(event.offers[0]()).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
it('keeps one pending creation and lets its existing handed-off owner finish after cleanup', async () => {
  const { target, started } = seedBrowserPairedNewTabOwner()
  attach()
  const outcome = requestBrowserPairedNewTab(target, Date.now() + 5000)
  void outcome.catch(() => {})
  await Promise.race([started, outcome])
  await expect(requestBrowserPairedNewTab(target, Date.now() + 5000)).rejects.toThrow('busy')
  unsubs.forEach((dispose) => dispose())
  unsubs = []
  pendingCreates[0].resolve('fixture-after-cleanup')
  await expect(outcome).resolves.toMatchObject({ remotePageId: 'fixture-after-cleanup' })
  expect(pendingCreates).toHaveLength(1)
})
it('does not acknowledge a same-id re-pair while creation is held', async () => {
  const { target, started } = seedBrowserPairedNewTabOwner()
  attach()
  const outcome = requestBrowserPairedNewTab(target, Date.now() + 5000)
  void outcome.catch(() => {})
  await Promise.race([started, outcome])
  replaceRuntimeEnvironmentRevisions([
    { id: target.environmentId, createdAt: 1, pairingRevision: 8 }
  ])
  pendingCreates[0].resolve('fixture-stale-pair')
  await expect(outcome).rejects.toThrow('creation_changed')
})
it('bounds held creation receipt without claiming rollback of late provider success', async () => {
  const { target, started } = seedBrowserPairedNewTabOwner()
  attach()
  vi.useFakeTimers()
  const outcome = requestBrowserPairedNewTab(target, Date.now() + 20)
  const caught = outcome.catch((error) => error)
  await Promise.race([started, outcome])
  await vi.advanceTimersByTimeAsync(21)
  expect(await caught).toMatchObject({ message: 'browser_paired_new_tab_expired_effect_unknown' })
  pendingCreates[0].resolve('fixture-late-paired')
  await vi.advanceTimersByTimeAsync(0)
  expect(await caught).toBeInstanceOf(Error)
})

it('preserves authoritative paired folder ownership through the same no-group creation and snapshot projector', async () => {
  const seeded = seedBrowserPairedNewTabOwner(false)
  const target = { ...seeded.target, worktree: 'folder:paired-fixture' }
  useAppStore.setState({
    activeWorktreeId: target.worktree,
    folderWorkspaces: [
      {
        id: 'paired-fixture',
        projectGroupId: 'fixture-group',
        name: 'Fixture',
        folderPath: '/fixture',
        executionHostId: target.executionHostId,
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0,
        createdAt: 0,
        updatedAt: 0
      }
    ],
    groupsByWorktree: {},
    activeGroupIdByWorktree: {},
    layoutByWorktree: {},
    unifiedTabsByWorktree: {}
  })
  attach()
  const outcome = requestBrowserPairedNewTab(target, Date.now() + 5000)
  void outcome.catch(() => {})
  await Promise.race([seeded.started, outcome])
  expect(pendingCreates).toHaveLength(1)
  pendingCreates[0].resolve('fixture-folder-page')
  await expect(outcome).resolves.toMatchObject({
    target,
    remotePageId: 'fixture-folder-page',
    materialized: true
  })
})
it('rejects a captured offer after active workspace ABA before execution', async () => {
  const { target, call } = seedBrowserPairedNewTabOwner()
  attach()
  const event = new BrowserPairedNewTabEvent(target, Date.now() + 5000)
  window.dispatchEvent(event)
  useAppStore.setState({ activeWorktreeId: 'folder:other' })
  useAppStore.setState({ activeWorktreeId: target.worktree })
  const outcome = event.offers[0]()
  void outcome.catch(() => {})
  await expect(outcome).rejects.toThrow('target_changed')
  expect(call).not.toHaveBeenCalled()
})

it('refuses a materialized receipt past its deadline before the timer callback can run', async () => {
  const { target, started } = seedBrowserPairedNewTabOwner()
  attach()
  vi.useFakeTimers()
  const outcome = requestBrowserPairedNewTab(target, Date.now() + 20)
  void outcome.catch(() => {})
  await Promise.race([started, outcome])
  vi.setSystemTime(Date.now() + 21)
  pendingCreates[0].resolve('fixture-clock-expired')
  await expect(outcome).rejects.toThrow('expired_effect_unknown')
})
