// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { getDefaultSettings, FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { createTestStore, makeTabGroup, seedStore } from '@/store/slices/store-test-helpers'
import type * as CreationPolicy from '@/lib/client-creation-action-policy'
import { requestBrowserNewTab } from '@/runtime/browser-new-tab-request'
import { registerContentCreationIpcBridge } from './content-creation-ipc-bridge'
const fixture = vi.hoisted(() => {
  let store: ReturnType<typeof createTestStore> | undefined
  let onNew: (() => void) | undefined
  return {
    getStore: () => {
      if (!store) {
        throw new Error('missing store')
      }
      return store
    },
    setStore: (value: ReturnType<typeof createTestStore>) => {
      store = value
    },
    get onNew() {
      return onNew
    },
    set onNew(value: (() => void) | undefined) {
      onNew = value
    },
    provider: 'local-client'
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.getStore().getState() } }))
vi.mock('@/lib/client-creation-action-policy', async (importOriginal) => {
  const actual = await importOriginal<typeof CreationPolicy>()
  return {
    ...actual,
    getClientCreationActionPolicy: () => ({
      'managed-browser': { state: 'enabled', provider: fixture.provider }
    })
  }
})
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  restorePtyDataHandlersAfterFailedShutdown: vi.fn(),
  unregisterPtyDataHandlers: () => []
}))
const worktree = 'folder:new-browser'
const unsubs: (() => void)[] = []
beforeEach(() => {
  fixture.provider = 'local-client'
  fixture.setStore(createTestStore())
  fixture.onNew = undefined
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: {
        set: vi.fn().mockResolvedValue(undefined),
        onNewBrowserTab: (callback: () => void) => {
          fixture.onNew = callback
          return () => {
            fixture.onNew = undefined
          }
        },
        onNewMarkdownTab: () => () => {}
      },
      settings: { set: vi.fn().mockResolvedValue(undefined) },
      browser: { notifyActiveTabChanged: vi.fn().mockResolvedValue(undefined) }
    }
  })
  seedStore(fixture.getStore(), {
    settings: getDefaultSettings(tmpdir()),
    persistedUIReady: true,
    activeWorktreeId: worktree,
    worktreesByRepo: {},
    folderWorkspaces: [
      {
        id: 'new-browser',
        projectGroupId: 'project',
        name: 'Folder',
        folderPath: tmpdir(),
        executionHostId: 'local',
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
    browserDefaultUrl: 'https://default.invalid/',
    defaultBrowserSessionProfileId: 'profile-default',
    groupsByWorktree: {
      [worktree]: [
        makeTabGroup({ id: 'first', worktreeId: worktree }),
        makeTabGroup({ id: 'active', worktreeId: worktree })
      ],
      [FLOATING_TERMINAL_WORKTREE_ID]: [
        makeTabGroup({ id: 'floating', worktreeId: FLOATING_TERMINAL_WORKTREE_ID })
      ]
    },
    activeGroupIdByWorktree: { [worktree]: 'active', [FLOATING_TERMINAL_WORKTREE_ID]: 'floating' }
  })
  registerContentCreationIpcBridge(unsubs, () => false)
})
afterEach(() => {
  for (const unsub of unsubs.splice(0).toReversed()) {
    unsub()
  }
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
function request(target = { worktree, group: 'active' }) {
  return requestBrowserNewTab(target, Date.now() + 5000)
}
it('reuses the registered UI new-browser owner with the current folder active group and focus intent readback', async () => {
  const state = fixture.getStore().getState()
  const original = vi.spyOn(state, 'openNewBrowserTabInActiveWorkspace')
  const result = await request()
  expect(result).toMatchObject({
    target: { worktree, group: 'active' },
    placement: 'workspace',
    addressFocusRequested: true,
    guestRegistrationVerified: false
  })
  expect(original).toHaveBeenCalledWith('active')
  const after = fixture.getStore().getState()
  expect(
    after.browserTabsByWorktree[worktree]?.find((tab) => tab.id === result.workspace)
      ?.sessionProfileId
  ).toBe('profile-default')
  expect(after.browserPagesByWorkspace[result.workspace]?.[0]).toMatchObject({
    id: result.page,
    url: 'https://default.invalid/'
  })
  expect(after.groupsByWorktree[worktree]?.find((group) => group.id === 'first')?.tabOrder).toEqual(
    []
  )
  fixture.onNew?.()
  await Promise.resolve()
  expect(original).toHaveBeenCalledTimes(2)
  expect(fixture.getStore().getState().browserTabsByWorktree[worktree]).toHaveLength(2)
})
it('routes a focused floating panel to the original local floating helper without changing global workspace selection', async () => {
  const panel = document.createElement('div')
  panel.dataset.floatingTerminalPanel = ''
  panel.tabIndex = 0
  document.body.append(panel)
  panel.focus()
  const original = vi.spyOn(fixture.getStore().getState(), 'createBrowserTab')
  const result = await request({ worktree: FLOATING_TERMINAL_WORKTREE_ID, group: 'floating' })
  expect(result).toMatchObject({ placement: 'floating', addressFocusRequested: true })
  expect(original).toHaveBeenCalledWith(
    FLOATING_TERMINAL_WORKTREE_ID,
    'https://default.invalid/',
    expect.objectContaining({
      targetGroupId: 'floating',
      browserRuntimeEnvironmentId: null,
      focusAddressBar: true
    })
  )
  expect(fixture.getStore().getState().activeWorktreeId).toBe(worktree)
  expect(fixture.getStore().getState().browserTabsByWorktree[worktree]).toBeUndefined()
})
it('uses the original first-group fallback when no active group is recorded', async () => {
  fixture.getStore().setState({ activeGroupIdByWorktree: {} })
  expect(await request({ worktree, group: 'first' })).toMatchObject({
    target: { worktree, group: 'first' }
  })
})
it('refuses mismatched invocation, paired provider and SSH host before original creation', async () => {
  const original = vi.spyOn(fixture.getStore().getState(), 'openNewBrowserTabInActiveWorkspace')
  await expect(request({ worktree, group: 'first' })).rejects.toThrow('invocation_mismatch')
  fixture.provider = 'paired-runtime'
  await expect(request()).rejects.toThrow('paired_or_disabled')
  fixture.provider = 'local-client'
  const state = fixture.getStore().getState()
  fixture.getStore().setState({
    folderWorkspaces: state.folderWorkspaces.map((folder) => ({
      ...folder,
      executionHostId: 'ssh:remote'
    }))
  })
  await expect(request()).rejects.toThrow('host_mismatch')
  expect(original).not.toHaveBeenCalled()
})
it('rejects missing store effects and duplicate registrations before admitting success', async () => {
  const original = vi
    .spyOn(fixture.getStore().getState(), 'openNewBrowserTabInActiveWorkspace')
    .mockResolvedValue(undefined)
  await expect(request()).rejects.toThrow('effect_unknown')
  registerContentCreationIpcBridge(unsubs, () => false)
  original.mockClear()
  await expect(request()).rejects.toThrow('ambiguous')
  expect(original).not.toHaveBeenCalled()
})
it('rejects a created tab whose original callback did not request address focus', async () => {
  const store = fixture.getStore()
  const original = store.getState().createBrowserTab
  vi.spyOn(store.getState(), 'createBrowserTab').mockImplementation((worktree, url, options) =>
    original(worktree, url, { ...options, focusAddressBar: false })
  )
  await expect(request()).rejects.toThrow('effect_unknown')
  expect(store.getState().browserTabsByWorktree[worktree]).toHaveLength(1)
})
it('guards overlapping creation and finishes unknown when its actual registration is disposed during creation', async () => {
  const store = fixture.getStore()
  const original = store.getState().openNewBrowserTabInActiveWorkspace
  let release: (() => void) | undefined
  vi.spyOn(store.getState(), 'openNewBrowserTabInActiveWorkspace').mockImplementation((group) => {
    void original(group)
    return new Promise<void>((resolve) => {
      release = resolve
    })
  })
  const pending = request()
  void pending.catch(() => {})
  await expect(request()).rejects.toThrow('busy')
  for (const unsub of unsubs.splice(0).toReversed()) {
    unsub()
  }
  await expect(pending).rejects.toThrow('unavailable_effect_unknown')
  release?.()
  await Promise.resolve()
  await expect(request()).rejects.toThrow('unavailable')
})
