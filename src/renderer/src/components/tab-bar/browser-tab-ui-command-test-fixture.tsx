import type { ReactNode } from 'react'
import { act } from '@testing-library/react'
import { vi, type Mock } from 'vitest'
import type { BrowserWorkspace, BrowserPage } from '../../../../shared/browser-workspace-types'
import type { Tab, TabGroup } from '../../../../shared/tab-types'
import type { BrowserTabUiAction } from '../../../../shared/rpc-contract/browser-tab-ui-params'
import { requestBrowserTabUi } from '@/runtime/browser-tab-ui-request'
import { useTabGroupActivationCommands } from '../tab-group/useTabGroupActivationCommands'
import { useTabGroupCloseScopeCommands } from '../tab-group/useTabGroupCloseScopeCommands'
import { useTabGroupCreationCommands } from '../tab-group/useTabGroupCreationCommands'
import { useTabBarItemActions } from './use-tab-bar-item-actions'
import BrowserTab from './BrowserTab'
type State = {
  settings: { activeRuntimeEnvironmentId: string | null }
  persistedUIReady: boolean
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>
  browserPagesByWorkspace: Record<string, BrowserPage[]>
  remoteBrowserPageHandlesByPageId: Record<string, { environmentId: string }>
  unifiedTabsByWorktree: Record<string, Tab[]>
  groupsByWorktree: Record<string, TabGroup[]>
  activeGroupIdByWorktree: Record<string, string>
  activeBrowserTabIdByWorktree: Record<string, string | null>
  activeTabTypeByWorktree: Record<string, string>
}
type TabUiFixture = {
  state: State
  initial: () => State
  tab: (id: string, pinned?: boolean) => Tab
  workspace: (id: string) => BrowserWorkspace
  blocked: Set<string>
  closed: string[]
  create: Mock<(...args: unknown[]) => unknown>
  close: Mock<(...args: unknown[]) => unknown>
  toggle: Mock<(...args: unknown[]) => unknown>
  activate: Mock<(...args: unknown[]) => unknown>
}
const fixture: TabUiFixture = vi.hoisted(() => {
  const tab = (id: string, pinned = false): Tab => ({
    id,
    entityId: `ws-${id}`,
    groupId: 'group',
    worktreeId: 'folder',
    contentType: 'browser',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    isPinned: pinned
  })
  const workspace = (id: string): BrowserWorkspace => ({
    id: `ws-${id}`,
    worktreeId: 'folder',
    url: 'https://example.test/',
    title: 'Example',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1,
    sessionProfileId: 'profile',
    sessionPartition: 'partition'
  })
  const initial = (): State => ({
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    browserTabsByWorktree: { folder: ['left', 'target', 'pinned', 'right'].map(workspace) },
    browserPagesByWorkspace: {},
    remoteBrowserPageHandlesByPageId: {},
    unifiedTabsByWorktree: {
      folder: [tab('left'), tab('target'), tab('pinned', true), tab('right')]
    },
    groupsByWorktree: {
      folder: [
        {
          id: 'group',
          worktreeId: 'folder',
          activeTabId: 'left',
          tabOrder: ['left', 'target', 'pinned', 'right']
        }
      ]
    },
    activeGroupIdByWorktree: { folder: 'other-group' },
    activeBrowserTabIdByWorktree: { folder: 'ws-left' },
    activeTabTypeByWorktree: { folder: 'editor' }
  })
  const closed: string[] = []
  return {
    state: initial(),
    initial,
    tab,
    workspace,
    blocked: new Set<string>(),
    closed,
    create: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
    activate: vi.fn()
  }
})
function closeMany(ids: string[]) {
  fixture.close(ids)
  fixture.closed.push(...ids.filter((id) => !fixture.blocked.has(id)))
  fixture.state.unifiedTabsByWorktree.folder = fixture.state.unifiedTabsByWorktree.folder.filter(
    (tab) => !ids.includes(tab.id) || fixture.blocked.has(tab.id)
  )
  fixture.state.browserTabsByWorktree.folder = fixture.state.browserTabsByWorktree.folder.filter(
    (workspace) =>
      !ids.includes(workspace.id.slice(3)) || fixture.blocked.has(workspace.id.slice(3))
  )
  fixture.state.groupsByWorktree.folder[0].tabOrder =
    fixture.state.groupsByWorktree.folder[0].tabOrder.filter(
      (id) => !ids.includes(id) || fixture.blocked.has(id)
    )
}
const actions = {
  focusGroup: (worktree: string, group: string) => {
    fixture.state.activeGroupIdByWorktree[worktree] = group
  },
  activateTab: (id: string) => {
    fixture.activate(id)
    fixture.state.groupsByWorktree.folder[0].activeTabId = id
  },
  setActiveBrowserTab: (id: string) => {
    fixture.state.activeBrowserTabIdByWorktree.folder = id
  },
  setActiveTabType: (type: string, worktree: string) => {
    fixture.state.activeTabTypeByWorktree[worktree] = type
  },
  setActiveTab: vi.fn(),
  setActiveFile: vi.fn(),
  closeEmptyGroup: vi.fn(),
  createTab: vi.fn(),
  createEmptySplitGroup: vi.fn(),
  openNewBrowserTabInActiveWorkspace: vi.fn(),
  openNewMarkdownInActiveWorkspace: vi.fn(),
  openNewTerminalTabInActiveWorkspace: vi.fn(),
  createBrowserTab: (
    worktree: string,
    url: string,
    options: {
      title: string
      sessionProfileId: string | null
      sessionPartition: string | null
      afterTabId: string
    }
  ) => {
    fixture.create(worktree, url, options)
    fixture.state.browserTabsByWorktree[worktree].push({
      ...fixture.workspace('copy'),
      title: options.title,
      sessionProfileId: options.sessionProfileId,
      sessionPartition: options.sessionPartition,
      url
    })
    fixture.state.unifiedTabsByWorktree[worktree].push(fixture.tab('copy'))
    const group = fixture.state.groupsByWorktree[worktree][0]
    group.tabOrder.splice(group.tabOrder.indexOf(options.afterTabId) + 1, 0, 'copy')
  }
}
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: State & typeof actions) => unknown) =>
      selector({ ...fixture.state, ...actions }),
    { getState: () => ({ ...fixture.state, ...actions }) }
  )
}))
vi.mock('@/runtime/web-runtime-session', () => ({
  isWebRuntimeSessionActive: () => false,
  createWebRuntimeSessionBrowserTab: vi.fn(),
  createWebRuntimeSessionTerminal: vi.fn()
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({ getRuntimeEnvironmentIdForWorktree: () => null }))
vi.mock('@/lib/client-creation-action-policy', () => ({
  getClientCreationActionPolicy: () => ({
    'managed-browser': { state: 'enabled', provider: 'local' }
  })
}))
vi.mock('@/lib/focus-terminal-tab-surface', () => ({ focusTerminalTabSurface: vi.fn() }))
vi.mock('@/lib/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: vi.fn()
}))
vi.mock('./tab-create-entry-action', () => ({ openTabBarEntry: vi.fn() }))
vi.mock('@/lib/open-mobile-emulator-tab', () => ({ openMobileEmulatorTab: vi.fn() }))
vi.mock('@/lib/ensure-simulator-tab', () => ({
  ensureSimulatorTab: vi.fn(),
  getSimulatorTabForWorktree: vi.fn()
}))
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn() })
}))
vi.mock('./use-tab-strip-slot-props', () => ({ useTabStripSlotProps: () => ({}) }))
vi.mock('./TabWorkspaceLayoutMenuSection', () => ({ TabWorkspaceLayoutMenuSection: () => null }))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: () => null,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: () => null
}))
vi.mock('@/components/browser-favicon', () => ({ BrowserFavicon: () => null }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
function Owner() {
  const state = fixture.state
  const worktreeState = {
    groups: state.groupsByWorktree.folder,
    unifiedTabs: state.unifiedTabsByWorktree.folder,
    browserTabs: state.browserTabsByWorktree.folder,
    terminalTabs: [],
    openFiles: [],
    expandedPaneByTabId: {},
    terminalLayoutsByTabId: {},
    generatedTabTitlesEnabled: false,
    mobileEmulatorEnabled: false
  }
  const activation = useTabGroupActivationCommands({
    worktreeId: 'folder',
    groupId: 'group',
    groupTabs: state.unifiedTabsByWorktree.folder,
    worktreeState
  })
  const scope = useTabGroupCloseScopeCommands({
    worktreeId: 'folder',
    groupId: 'group',
    group: state.groupsByWorktree.folder[0],
    groupTabs: state.unifiedTabsByWorktree.folder,
    closeItem: (id) => closeMany([id]),
    closeMany,
    leaveWorktreeIfEmpty: vi.fn()
  })
  const creation = useTabGroupCreationCommands({
    worktreeId: 'folder',
    groupId: 'group',
    worktreeState
  })
  const itemActions = useTabBarItemActions({
    props: {
      onActivate: vi.fn(),
      onClose: vi.fn(),
      onActivateBrowserTab: activation.activateBrowser,
      onCloseBrowserTab: (id) => closeMany([id.slice(3)]),
      onCloseOthers: scope.closeOthers,
      onCloseToLeft: scope.closeToLeft,
      onCloseToRight: scope.closeToRight,
      onDuplicateBrowserTab: creation.duplicateBrowserTab,
      onSetCustomTitle: vi.fn(),
      onSetTabColor: vi.fn(),
      onTogglePaneExpand: vi.fn()
    },
    togglePinned: (item) => {
      fixture.toggle(item.unifiedTabId)
      const tab = fixture.state.unifiedTabsByWorktree.folder.find(
        (tab) => tab.id === item.unifiedTabId
      )
      if (tab) {
        tab.isPinned = !tab.isPinned
      }
    },
    toggleTabViewMode: vi.fn()
  })
  const workspace = state.browserTabsByWorktree.folder.find(
    (workspace) => workspace.id === 'ws-target'
  )
  if (!workspace) {
    return null
  }
  return (
    <BrowserTab
      tab={workspace}
      isActive={false}
      isPinned={
        state.unifiedTabsByWorktree.folder.find((tab) => tab.id === 'target')?.isPinned === true
      }
      hasTabsToLeft
      hasTabsToRight
      tabCount={4}
      onActivate={() => itemActions.activateBrowserTab(workspace.id)}
      onClose={() => itemActions.closeBrowserTab(workspace.id)}
      onCloseOthers={() => itemActions.closeOthers('target')}
      onCloseToLeft={() => itemActions.closeToLeft('target')}
      onCloseToRight={() => itemActions.closeToRight('target')}
      onTogglePin={() =>
        itemActions.togglePinned({
          type: 'browser',
          id: workspace.id,
          unifiedTabId: 'target',
          isPinned: false,
          data: workspace
        })
      }
      onDuplicate={() => itemActions.duplicateBrowserTab(workspace.id, 'target')}
      dragData={{
        kind: 'tab',
        groupId: 'group',
        worktreeId: 'folder',
        unifiedTabId: 'target',
        visibleTabId: workspace.id,
        tabType: 'browser',
        label: 'Example'
      }}
    />
  )
}
const target = { workspace: 'ws-target', worktree: 'folder', group: 'group', unifiedTab: 'target' }
async function command(action: BrowserTabUiAction, point?: { x: number; y: number }) {
  let response: ReturnType<typeof requestBrowserTabUi> | undefined
  await act(async () => {
    response = requestBrowserTabUi(target, action, Date.now() + 5000, point)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing tab UI response')
  }
  return response
}

export function resetBrowserTabUiFixture() {
  fixture.state = fixture.initial()
  fixture.closed = []
  fixture.blocked.clear()
  vi.clearAllMocks()
}
export { fixture, Owner, command, target }
