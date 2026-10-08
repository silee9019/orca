// @vitest-environment happy-dom
import { useSyncExternalStore } from 'react'
import { tmpdir } from 'node:os'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import type * as CreationPolicy from '@/lib/client-creation-action-policy'
import type { BrowserContextMenuRequestedEvent } from '../../../../../shared/browser-guest-events'
import { getDefaultSettings } from '../../../../../shared/constants'
import { createTestStore, makeTabGroup, seedStore } from '@/store/slices/store-test-helpers'
import { requestBrowserContextMenu } from '@/runtime/browser-context-menu-request'
import { BrowserPageContextMenu } from './browser-page-context-menu'
const fixture = vi.hoisted(() => {
  let store: ReturnType<typeof createTestStore> | undefined
  let requested: ((event: BrowserContextMenuRequestedEvent) => void) | undefined
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
    get requested() {
      return requested
    },
    set requested(value: ((event: BrowserContextMenuRequestedEvent) => void) | undefined) {
      requested = value
    },
    provider: 'local-client'
  }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: AppState) => unknown) =>
      selector(useSyncExternalStore(fixture.getStore().subscribe, fixture.getStore().getState)),
    { getState: () => fixture.getStore().getState() }
  )
}))
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
vi.mock('@/lib/ui-zoom', () => ({ windowDipToCssPx: (value: number) => value }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  restorePtyDataHandlersAfterFailedShutdown: vi.fn(),
  unregisterPtyDataHandlers: () => []
}))
const worktree = 'folder:context-link'
let pageId = '',
  sourceId = '',
  pinnedId = '',
  tailId = ''
const guest = Object.assign(document.createElement('div'), { goBack: vi.fn(), goForward: vi.fn() })
guest.tabIndex = 0
beforeEach(() => {
  fixture.provider = 'local-client'
  fixture.setStore(createTestStore())
  document.body.append(guest)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: {
        notifyActiveTabChanged: vi.fn().mockResolvedValue(undefined),
        onContextMenuRequested: (callback: (event: BrowserContextMenuRequestedEvent) => void) => {
          fixture.requested = callback
          return () => {
            fixture.requested = undefined
          }
        },
        onContextMenuDismissed: () => () => {}
      },
      ui: { set: vi.fn().mockResolvedValue(undefined) },
      settings: { set: vi.fn().mockResolvedValue(undefined) }
    }
  })
  const store = fixture.getStore()
  seedStore(store, {
    settings: getDefaultSettings(tmpdir()),
    persistedUIReady: true,
    activeWorktreeId: worktree,
    worktreesByRepo: {},
    folderWorkspaces: [
      {
        id: 'context-link',
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
    defaultBrowserSessionProfileId: 'default-profile',
    groupsByWorktree: {
      [worktree]: [
        makeTabGroup({ id: 'source', worktreeId: worktree }),
        makeTabGroup({ id: 'other', worktreeId: worktree })
      ]
    },
    activeGroupIdByWorktree: { [worktree]: 'source' }
  })
  const workspace = store.getState().createBrowserTab(worktree, 'https://source.test/', {
    targetGroupId: 'source',
    executionHostId: 'local'
  })
  const page = store.getState().browserPagesByWorkspace[workspace.id]?.[0]
  const source = store
    .getState()
    .unifiedTabsByWorktree[worktree]?.find((tab) => tab.entityId === workspace.id)
  if (!page || !source) {
    throw new Error('source missing')
  }
  pageId = page.id
  sourceId = source.id
  const tail = store.getState().createBrowserTab(worktree, 'https://tail.test/', {
    targetGroupId: 'source',
    afterTabId: sourceId,
    executionHostId: 'local',
    activate: false
  })
  const tailTab = store
    .getState()
    .unifiedTabsByWorktree[worktree]?.find((tab) => tab.entityId === tail.id)
  if (!tailTab) {
    throw new Error('tail missing')
  }
  tailId = tailTab.id
  pinnedId = store.getState().createUnifiedTab(worktree, 'editor', {
    targetGroupId: 'source',
    entityId: 'fixture-editor',
    isPinned: true,
    activate: false,
    executionHostId: 'local'
  }).id
  store.getState().createBrowserTab(worktree, 'https://other.test/', {
    targetGroupId: 'other',
    executionHostId: 'local'
  })
})
afterEach(() => {
  cleanup()
  guest.remove()
})
function Owner() {
  return (
    <BrowserPageContextMenu
      browserPageId={pageId}
      worktreeId={worktree}
      isActive={true}
      canGoBack={false}
      canGoForward={false}
      webviewRef={{ current: guest }}
      onReload={() => {}}
    />
  )
}
function open() {
  act(() =>
    fixture.requested?.({
      browserPageId: pageId,
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      linkUrl: 'https://link.test/path',
      pageUrl: 'https://source.test/',
      selectionText: '',
      canGoBack: false,
      canGoForward: false
    })
  )
}
async function command() {
  let response: ReturnType<typeof requestBrowserContextMenu> | undefined
  await act(async () => {
    response = requestBrowserContextMenu(pageId, 'open-link', Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing response')
  }
  return response
}
it.each([false, true])(
  'creates in the exact source group and pin partition with activation preserved (pinned %j)',
  async (pinned) => {
    const store = fixture.getStore()
    if (pinned) {
      store.setState({
        groupsByWorktree: {
          [worktree]:
            store
              .getState()
              .groupsByWorktree[worktree]?.map((group) =>
                group.id === 'source' ? { ...group, tabOrder: [sourceId, pinnedId, tailId] } : group
              ) ?? []
        },
        unifiedTabsByWorktree: {
          [worktree]:
            store
              .getState()
              .unifiedTabsByWorktree[worktree]?.map((tab) =>
                tab.id === sourceId ? { ...tab, isPinned: true } : tab
              ) ?? []
        }
      })
    }
    render(<Owner />)
    open()
    const before = store.getState()
    const result = await command()
    const created = result.linkTab
    if (!created) {
      throw new Error('missing created tab')
    }
    const after = store.getState()
    const wrapper = after.unifiedTabsByWorktree[worktree]?.find(
      (tab) => tab.id === created.unifiedTab
    )
    expect(result).toMatchObject({
      open: false,
      linkTab: { group: 'source', activated: false, guestRegistrationVerified: false }
    })
    expect(created.tabOrder).toEqual(
      pinned
        ? [sourceId, pinnedId, created.unifiedTab, tailId]
        : [pinnedId, sourceId, created.unifiedTab, tailId]
    )
    expect(wrapper).toMatchObject({ executionHostId: 'local', groupId: 'source' })
    expect(after.browserPagesByWorkspace[created.workspace]?.[0]).toMatchObject({
      url: 'https://link.test/path',
      title: 'https://link.test/path'
    })
    expect(
      after.browserTabsByWorktree[worktree]?.find((tab) => tab.id === created.workspace)
    ).toMatchObject({ sessionProfileId: 'default-profile' })
    expect(after.activeGroupIdByWorktree).toEqual(before.activeGroupIdByWorktree)
    expect(after.activeBrowserTabIdByWorktree).toEqual(before.activeBrowserTabIdByWorktree)
    expect(after.activeTabTypeByWorktree).toEqual(before.activeTabTypeByWorktree)
    expect(after.activeBrowserTabId).toBe(before.activeBrowserTabId)
    expect(document.activeElement).toBe(guest)
  }
)
it('refuses paired policy or nonlocal source before invoking existing creation owner', async () => {
  const store = fixture.getStore()
  const create = vi.spyOn(store.getState(), 'createBrowserTab')
  render(<Owner />)
  open()
  fixture.provider = 'paired-runtime'
  await expect(command()).rejects.toThrow('creation_unsupported')
  expect(create).not.toHaveBeenCalled()
  fixture.provider = 'local-client'
  act(() =>
    store.setState({
      unifiedTabsByWorktree: {
        [worktree]:
          store
            .getState()
            .unifiedTabsByWorktree[worktree]?.map((tab) =>
              tab.id === sourceId ? { ...tab, executionHostId: 'ssh:host' } : tab
            ) ?? []
      }
    })
  )
  await expect(command()).rejects.toThrow('host_mismatch')
  expect(create).not.toHaveBeenCalled()
})
it('rejects ambiguous source ownership before creating a tab', async () => {
  const store = fixture.getStore()
  const create = vi.spyOn(store.getState(), 'createBrowserTab')
  const pages = store.getState().browserPagesByWorkspace
  act(() =>
    store.setState({
      browserPagesByWorkspace: Object.fromEntries(
        Object.entries(pages).map(([key, value]) => [
          key,
          [
            ...value,
            ...Object.values(pages)
              .flat()
              .filter((page) => page.id === pageId)
          ]
        ])
      )
    })
  )
  render(<Owner />)
  open()
  await expect(command()).rejects.toThrow('source_placement_unavailable')
  expect(create).not.toHaveBeenCalled()
})
