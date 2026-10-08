// @vitest-environment happy-dom
import { useShallow } from 'zustand/react/shallow'
import { act, cleanup, render, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../shared/constants'
import { installClientHostedPaneApi } from './browser-pane/client-hosted-browser-pane-test-rig'
import { TerminalTitlebarTabs, type TerminalTitlebarController } from './TerminalTitlebarTabs'
import { useTerminalCreateActions } from './use-terminal-create-actions'
import { useTerminalActivationActions } from './use-terminal-activation-actions'
import { useTerminalCloseActions } from './use-terminal-close-actions'
import { requestBrowserTabUi } from '@/runtime/browser-tab-ui-request'
import { registerBrowserNewTabCommands } from '@/hooks/ipc-events/browser-new-tab-commands'
import { createBrowserTabForCurrentViewer } from '@/hooks/ipc-events/browser-new-tab-owner'
import { requestBrowserNewTab } from '@/runtime/browser-new-tab-request'
import { TooltipProvider } from './ui/tooltip'
import type { TabBarProps } from './tab-bar/tab-bar-props'
import BrowserTab from './tab-bar/BrowserTab'
import { useTabBarItemActions } from './tab-bar/use-tab-bar-item-actions'
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {} })
}))
vi.mock('./tab-bar/TabBar', () => ({
  default: function TitlebarTabBarFixture(props: TabBarProps) {
    const actions = useTabBarItemActions({
      props,
      togglePinned: () => {},
      toggleTabViewMode: () => {}
    })
    const state = useAppStore.getState()
    return (
      <TooltipProvider>
        <button onClick={props.onNewBrowserTab}>Titlebar browser</button>
        {props.browserTabs?.map((tab) => {
          const unified = state.unifiedTabsByWorktree[props.worktreeId]?.find(
            (item) => item.entityId === tab.id
          )
          if (!unified) {
            throw new Error('missing unified tab')
          }
          return (
            <BrowserTab
              key={tab.id}
              tab={tab}
              isActive={props.activeBrowserTabId === tab.id}
              hasTabsToRight={false}
              hasTabsToLeft={false}
              tabCount={props.browserTabs?.length ?? 0}
              isPinned={false}
              onActivate={() => actions.activateBrowserTab(tab.id)}
              onClose={() => actions.closeBrowserTab(tab.id)}
              onCloseOthers={() => {}}
              onCloseToRight={() => {}}
              onCloseToLeft={() => {}}
              onDuplicate={() => actions.duplicateBrowserTab(tab.id, unified.id)}
              onTogglePin={() => {}}
              dragData={{
                kind: 'tab',
                tabType: 'browser',
                visibleTabId: tab.id,
                label: tab.title,
                worktreeId: props.worktreeId,
                groupId: unified.groupId,
                unifiedTabId: unified.id
              }}
            />
          )
        })}
      </TooltipProvider>
    )
  }
}))
import { makeFolderWorkspace } from '../store/slices/worktrees-slice-test-fixtures'
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const worktree = 'folder:fixture'
let target: HTMLElement
function Fixture() {
  const state = useAppStore(
    useShallow((state) => ({
      createBrowserTab: state.createBrowserTab,
      createTab: state.createTab,
      openNewBrowserTabInActiveWorkspace: state.openNewBrowserTabInActiveWorkspace,
      openNewMarkdownInActiveWorkspace: state.openNewMarkdownInActiveWorkspace,
      openNewTerminalTabInActiveWorkspace: state.openNewTerminalTabInActiveWorkspace,
      setActiveTabType: state.setActiveTabType,
      setTabBarOrder: state.setTabBarOrder,
      setActiveBrowserTab: state.setActiveBrowserTab,
      setActiveTab: state.setActiveTab,
      activeBrowserTabIdByWorktree: state.activeBrowserTabIdByWorktree,
      activeTabTypeByWorktree: state.activeTabTypeByWorktree,
      browserTabsByWorktree: state.browserTabsByWorktree,
      setActiveFile: state.setActiveFile,
      setTabColor: state.setTabColor,
      setTabCustomTitle: state.setTabCustomTitle
    }))
  )
  const create = useTerminalCreateActions({ ...state, activeWorktreeId: worktree })
  const activate = useTerminalActivationActions({ ...state, activeWorktreeId: worktree })
  const close = useTerminalCloseActions({ consumeSuppressedPtyExit: () => false })
  const controller: TerminalTitlebarController = {
    activeBrowserTabId: state.activeBrowserTabIdByWorktree[worktree] ?? null,
    activeFileId: null,
    activeTabId: null,
    activeTabType: state.activeTabTypeByWorktree[worktree] ?? 'browser',
    effectiveActiveLayout: undefined,
    expandedPaneByTabId: {},
    ...create,
    ...activate,
    ...close,
    handleCloseAllFiles: () => {},
    handleCloseFile: () => {},
    handleCloseOthers: () => {},
    handleCloseTabsToLeft: () => {},
    handleCloseTabsToRight: () => {},
    makePreviewFilePermanent: () => {},
    mobileEmulatorEnabled: false,
    pinFile: () => {},
    renderedActiveWorktreeId: worktree,
    setActiveFile: state.setActiveFile,
    setActiveTab: state.setActiveTab,
    setActiveTabType: state.setActiveTabType,
    setTabColor: state.setTabColor,
    setTabCustomTitle: state.setTabCustomTitle,
    tabBarOrder: [],
    titlebarTabsTarget: target,
    worktreeBrowserTabs: state.browserTabsByWorktree[worktree] ?? [],
    worktreeClientHostedBrowserRows: [],
    worktreeFiles: []
  }
  return <TerminalTitlebarTabs controller={controller} />
}
function setup() {
  installClientHostedPaneApi()
  Reflect.set(
    window.api.browser,
    'notifyActiveTabChanged',
    vi.fn(async () => {})
  )
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: worktree,
    activeWorkspaceExecutionHostId: 'local',
    folderWorkspaces: [makeFolderWorkspace({ id: 'fixture', executionHostId: 'local' })]
  })
  target = document.createElement('div')
  document.body.append(target)
  useAppStore
    .getState()
    .createBrowserTab(worktree, 'https://example.test', { browserRuntimeEnvironmentId: null })
  return render(<Fixture />)
}
afterEach(() => {
  cleanup()
  target?.remove()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('uses the actual titlebar controller activate/duplicate/close callbacks through its mounted BrowserTab owner', async () => {
  setup()
  const state = useAppStore.getState()
  const ws = state.browserTabsByWorktree[worktree][0]
  const tab = state.unifiedTabsByWorktree[worktree].find((tab) => tab.entityId === ws.id)
  if (!tab) {
    throw new Error('missing tab')
  }
  const scope = { worktree, workspace: ws.id, unifiedTab: tab.id, group: tab.groupId }
  await act(async () => {
    await expect(requestBrowserTabUi(scope, 'activate', Date.now() + 1000)).resolves.toMatchObject({
      activeWorkspace: ws.id,
      activeTab: tab.id
    })
  })
  await act(async () => {
    await expect(
      requestBrowserTabUi(scope, 'duplicate', Date.now() + 1000)
    ).resolves.toHaveProperty('duplicatedWorkspace')
  })
  await act(async () => {
    await expect(requestBrowserTabUi(scope, 'close', Date.now() + 1000)).resolves.toMatchObject({
      exists: false
    })
  })
})
it('shares the exact workspace creation helper between titlebar and existing viewer new-ui owner', async () => {
  setup()
  const count = useAppStore.getState().browserTabsByWorktree[worktree].length
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Titlebar browser' }))
    await Promise.resolve()
  })
  expect(useAppStore.getState().browserTabsByWorktree[worktree]).toHaveLength(count + 1)
  const dispose = registerBrowserNewTabCommands(() =>
    createBrowserTabForCurrentViewer({ workspaceFallback: true })
  )
  try {
    const group = useAppStore.getState().activeGroupIdByWorktree[worktree]
    await act(async () => {
      await expect(
        requestBrowserNewTab({ worktree, group }, Date.now() + 1000)
      ).resolves.toMatchObject({ placement: 'workspace', addressFocusRequested: true })
    })
  } finally {
    dispose()
  }
})

it('retains exact local target, expiry and pinned refusal gates in the existing tab-ui owner', async () => {
  const view = setup()
  const state = useAppStore.getState()
  const ws = state.browserTabsByWorktree[worktree][0]
  const tab = state.unifiedTabsByWorktree[worktree].find((tab) => tab.entityId === ws.id)
  if (!tab) {
    throw new Error('missing tab')
  }
  const scope = { worktree, workspace: ws.id, unifiedTab: tab.id, group: tab.groupId }
  await expect(requestBrowserTabUi(scope, 'duplicate', Date.now() - 1)).rejects.toThrow('expired')
  await act(async () => {
    useAppStore.setState({
      settings: { ...getDefaultSettings('/fixture'), activeRuntimeEnvironmentId: 'fixture-paired' }
    })
  })
  await expect(requestBrowserTabUi(scope, 'duplicate', Date.now() + 1000)).rejects.toThrow(
    'not_ready'
  )
  await act(async () => {
    useAppStore.setState({
      settings: getDefaultSettings('/fixture'),
      unifiedTabsByWorktree: { [worktree]: [{ ...tab, isPinned: true }] }
    })
  })
  await expect(requestBrowserTabUi(scope, 'close', Date.now() + 1000)).rejects.toThrow('pinned')
  expect(useAppStore.getState().browserTabsByWorktree[worktree]).toHaveLength(1)
  view.unmount()
  await expect(requestBrowserTabUi(scope, 'activate', Date.now() + 1000)).rejects.toThrow(
    'unavailable'
  )
})
