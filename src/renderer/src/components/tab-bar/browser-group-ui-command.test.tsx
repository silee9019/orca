// @vitest-environment happy-dom
import { tmpdir } from 'node:os'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import type * as CreationPolicy from '@/lib/client-creation-action-policy'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  createTestStore,
  makeTabGroup,
  makeWorktree,
  seedStore
} from '@/store/slices/store-test-helpers'
import { useTabGroupCreationCommands } from '../tab-group/useTabGroupCreationCommands'
import { requestBrowserGroupUi } from '@/runtime/browser-group-ui-request'
import TabBar from './TabBar'
const fixture = vi.hoisted(() => {
  let store: ReturnType<typeof createTestStore> | undefined
  let nested: Promise<unknown> | undefined
  let secondNested: Promise<unknown> | undefined
  return {
    getStore: () => {
      if (!store) {
        throw new Error('test store not initialized')
      }
      return store
    },
    setStore: (value: ReturnType<typeof createTestStore>) => {
      store = value
    },
    enabled: true,
    provider: 'local-client',
    skip: false,
    reenter: false,
    get secondNested() {
      return secondNested
    },
    set secondNested(value: Promise<unknown> | undefined) {
      secondNested = value
    },
    get nested() {
      return nested
    },
    set nested(value: Promise<unknown> | undefined) {
      nested = value
    },
    created: vi.fn()
  }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: AppState) => unknown) => selector(fixture.getStore().getState()),
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
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('./use-tab-bar-runtime-model', () => ({
  useTabBarRuntimeModel: ({ groupId }: { groupId?: string }) => ({
    resolvedGroupId: groupId ?? 'group',
    managedBrowserCreationEnabled: fixture.enabled,
    unifiedTabs: [],
    unifiedTabByVisibleId: new Map(),
    statusByRelativePath: new Map(),
    agentLaunchOptions: []
  })
}))
vi.mock('./use-tab-bar-create-menu-controller', () => ({
  useTabBarCreateMenuController: () => ({})
}))
vi.mock('./use-tab-bar-item-projection', () => ({
  useTabBarItemProjection: () => ({ tabStripLayoutKey: '' })
}))
vi.mock('./tab-strip-overflow-navigation', () => ({
  useTabStripOverflowNavigation: () => ({
    tabStripOverflowState: { canScrollStart: false, canScrollEnd: false }
  })
}))
vi.mock('./tab-strip-drag-scroll', () => ({ useTabStripDragScrollHandlers: () => ({}) }))
vi.mock('@/lib/pane-manager/client-hosted-browser-row-state', () => ({
  useActiveClientHostedBrowserRowId: () => null
}))
vi.mock('./tab-bar-surface', () => ({ renderTabBarSurface: () => null }))
vi.mock('@/runtime/web-runtime-session', () => ({
  isWebRuntimeSessionActive: () => false,
  createWebRuntimeSessionBrowserTab: vi.fn(),
  createWebRuntimeSessionTerminal: vi.fn()
}))
vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  restorePtyDataHandlersAfterFailedShutdown: vi.fn(),
  unregisterPtyDataHandlers: () => []
}))
function Owner({
  group = 'group',
  terminalOnly = false
}: {
  group?: string
  terminalOnly?: boolean
}) {
  const state = fixture.getStore().getState()
  const creation = useTabGroupCreationCommands({
    groupId: 'group',
    worktreeId: target.worktree,
    worktreeState: {
      groups: state.groupsByWorktree[target.worktree] ?? [],
      unifiedTabs: [],
      browserTabs: [],
      terminalTabs: [],
      openFiles: [],
      expandedPaneByTabId: {},
      terminalLayoutsByTabId: {},
      generatedTabTitlesEnabled: false,
      mobileEmulatorEnabled: false
    }
  })
  return (
    <TabBar
      groupId={group}
      worktreeId={target.worktree}
      terminalOnly={terminalOnly}
      tabs={[]}
      activeTabId={null}
      expandedPaneByTabId={{}}
      onActivate={vi.fn()}
      onClose={vi.fn()}
      onCloseOthers={vi.fn()}
      onCloseToRight={vi.fn()}
      onCloseToLeft={vi.fn()}
      onNewTerminalTab={vi.fn()}
      onSetCustomTitle={vi.fn()}
      onSetTabColor={vi.fn()}
      onTogglePaneExpand={vi.fn()}
      onNewBrowserTab={() => {
        fixture.created()
        if (fixture.reenter) {
          fixture.nested = requestBrowserGroupUi(
            { worktree: 'folder', group: 'group' },
            'new-browser',
            Date.now() + 5000
          )
          void fixture.nested.catch(() => {})
          fixture.secondNested = requestBrowserGroupUi(
            { worktree: 'folder', group: 'group' },
            'new-browser',
            Date.now() + 5000
          )
          void fixture.secondNested.catch(() => {})
        }
        if (!fixture.skip) {
          creation.newBrowserTab()
        }
      }}
    />
  )
}
beforeEach(() => {
  target.worktree = 'folder'
  fixture.setStore(createTestStore())
  fixture.enabled = true
  fixture.provider = 'local-client'
  fixture.skip = false
  fixture.reenter = false
  fixture.nested = undefined
  fixture.secondNested = undefined
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: { notifyActiveTabChanged: vi.fn().mockResolvedValue(undefined) },
      ui: { set: vi.fn().mockResolvedValue(undefined) },
      settings: { set: vi.fn().mockResolvedValue(undefined) }
    }
  })
  const store = fixture.getStore()
  seedStore(store, {
    settings: getDefaultSettings(tmpdir()),
    persistedUIReady: true,
    activeWorktreeId: 'folder',
    browserDefaultUrl: 'https://example.test/new',
    defaultBrowserSessionProfileId: 'default-profile',
    worktreesByRepo: { repo1: [makeWorktree({ id: 'folder', repoId: 'repo1' })] },
    groupsByWorktree: {
      folder: [
        makeTabGroup({ id: 'group', worktreeId: 'folder' }),
        makeTabGroup({ id: 'other', worktreeId: 'folder' })
      ]
    },
    activeGroupIdByWorktree: { folder: 'other' },
    layoutByWorktree: {
      folder: {
        type: 'split',
        direction: 'horizontal',
        first: { type: 'leaf', groupId: 'group' },
        second: { type: 'leaf', groupId: 'other' }
      }
    }
  })
})
afterEach(cleanup)
const target = { worktree: 'folder', group: 'group' }
async function command(
  action: 'new-browser' | 'status' = 'new-browser',
  expiresAt = Date.now() + 5000
) {
  let response: ReturnType<typeof requestBrowserGroupUi> | undefined
  await act(async () => {
    response = requestBrowserGroupUi(target, action, expiresAt)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing response')
  }
  return response
}
it('uses actual mounted TabBar/group callback and real browser store creation', async () => {
  const focus = vi.spyOn(fixture.getStore().getState(), 'focusGroup')
  const unified = vi.spyOn(fixture.getStore().getState(), 'createUnifiedTab')
  render(<Owner />)
  const result = await command()
  const state = fixture.getStore().getState()
  const workspace = state.browserTabsByWorktree.folder?.[0]
  expect(fixture.created).toHaveBeenCalledOnce()
  expect(workspace).toMatchObject({
    id: result.createdWorkspace,
    url: 'https://example.test/new',
    sessionProfileId: 'default-profile'
  })
  expect(result).toMatchObject({
    target,
    activeWorkspace: workspace?.id,
    addressFocusRequested: true,
    guestRegistrationVerified: false
  })
  expect(state.groupsByWorktree.folder?.find((g) => g.id === 'group')?.tabOrder).toEqual(
    result.tabOrder
  )
  expect(state.groupsByWorktree.folder?.find((g) => g.id === 'other')?.tabOrder).toEqual([])
  expect(unified).toHaveReturnedWith(expect.objectContaining({ groupId: 'group' }))
  expect(focus).toHaveBeenCalledWith('folder', 'group')
  expect(state.activeGroupIdByWorktree.folder).toBe('group')
})
it('targets an unfocused workspace without changing global selection or requesting address focus', async () => {
  fixture.getStore().setState({ activeWorktreeId: 'elsewhere' })
  render(<Owner />)
  expect(await command()).toMatchObject({ addressFocusRequested: false })
  expect(fixture.getStore().getState().activeWorktreeId).toBe('elsewhere')
  expect(fixture.getStore().getState().browserTabsByWorktree.elsewhere).toBeUndefined()
})
it('uses the real folder workspace owner without a Git worktree row', async () => {
  target.worktree = 'folder:folder-1'
  fixture.getStore().setState({
    activeWorktreeId: target.worktree,
    worktreesByRepo: {},
    folderWorkspaces: [
      {
        id: 'folder-1',
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
    groupsByWorktree: {
      [target.worktree]: [makeTabGroup({ id: 'group', worktreeId: target.worktree })]
    },
    activeGroupIdByWorktree: { [target.worktree]: 'group' }
  })
  render(<Owner />)
  const result = await command()
  expect(result).toMatchObject({
    target,
    createdWorkspace: expect.any(String),
    addressFocusRequested: true
  })
  expect(
    fixture.getStore().getState().browserTabsByWorktree[target.worktree]?.[0]?.worktreeId
  ).toBe(target.worktree)
  expect(fixture.getStore().getState().browserTabsByWorktree.folder).toBeUndefined()
})
it.each(['ssh:fixture', 'runtime:fixture'] as const)(
  'refuses native creation for active host %s before invoking its callback',
  async (host) => {
    fixture.getStore().setState({ activeWorkspaceExecutionHostId: host })
    render(<Owner />)
    await expect(command()).rejects.toThrow('host_mismatch')
    expect(fixture.created).not.toHaveBeenCalled()
    expect(fixture.getStore().getState().browserTabsByWorktree.folder).toBeUndefined()
  }
)
it('reads status without creation and refuses missing owner, expired or non-ready requests', async () => {
  await expect(command()).rejects.toThrow('unavailable')
  render(<Owner />)
  expect(await command('status')).toMatchObject({ target, tabOrder: [] })
  await expect(command('new-browser', Date.now() - 1)).rejects.toThrow('expired')
  fixture.getStore().setState({ persistedUIReady: false })
  await expect(command()).rejects.toThrow('not_ready')
  expect(fixture.created).not.toHaveBeenCalled()
})
it.each(['disabled', 'paired', 'terminal-only'])(
  'refuses %s creation before invoking the original callback',
  async (mode) => {
    if (mode === 'disabled') {
      fixture.enabled = false
    }
    if (mode === 'paired') {
      fixture.provider = 'paired-runtime'
    }
    render(<Owner terminalOnly={mode === 'terminal-only'} />)
    await expect(command()).rejects.toThrow(
      mode === 'paired' ? 'paired_creation_unsupported' : 'creation_disabled'
    )
    expect(fixture.created).not.toHaveBeenCalled()
  }
)
it('does not count a callback with no creation as success', async () => {
  fixture.skip = true
  render(<Owner />)
  await expect(command()).rejects.toThrow('effect_unknown')
})
it('refuses a partially created workspace whose original callback did not focus its group', async () => {
  vi.spyOn(fixture.getStore().getState(), 'focusGroup').mockImplementation(() => {})
  render(<Owner />)
  await expect(command()).rejects.toThrow('effect_unknown')
  expect(fixture.getStore().getState().browserTabsByWorktree.folder).toHaveLength(1)
})
it('refuses a reentrant creation while the original callback is running', async () => {
  fixture.reenter = true
  render(<Owner />)
  await command()
  await expect(fixture.nested).rejects.toThrow('busy')
  await expect(fixture.secondNested).rejects.toThrow('busy')
  expect(fixture.created).toHaveBeenCalledOnce()
})
