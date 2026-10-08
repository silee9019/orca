// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import { requestBrowserTabUi } from '@/runtime/browser-tab-ui-request'
import { useTerminalActivationActions } from '../use-terminal-activation-actions'
import { installClientHostedPaneApi } from '../browser-pane/client-hosted-browser-pane-test-rig'
import { makeFolderWorkspace } from '../../store/slices/worktrees-slice-test-fixtures'
import { TooltipProvider } from '../ui/tooltip'
import BrowserTab from './BrowserTab'

const drag = vi.hoisted(() => ({ begin: vi.fn() }))
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: { onPointerDown: drag.begin },
    setNodeRef: () => {}
  })
}))

const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const worktree = 'folder:pointer-fixture'
let targetWorkspace = ''
let originalWorkspace = ''

function owner() {
  const state = useAppStore.getState()
  const workspace = state.browserTabsByWorktree[worktree]?.find((tab) => tab.id === targetWorkspace)
  const unified = state.unifiedTabsByWorktree[worktree]?.find(
    (tab) => tab.entityId === targetWorkspace
  )
  if (!workspace || !unified) {
    throw new Error('Missing fixture workspace')
  }
  return { workspace, unified }
}

function Fixture() {
  const { workspace, unified } = owner()
  const state = useAppStore.getState()
  const activation = useTerminalActivationActions({
    activeWorktreeId: worktree,
    setActiveBrowserTab: state.setActiveBrowserTab,
    setActiveTab: state.setActiveTab,
    setActiveTabType: state.setActiveTabType
  })
  return (
    <TooltipProvider>
      <BrowserTab
        tab={workspace}
        isActive={false}
        isPinned={false}
        hasTabsToRight={false}
        hasTabsToLeft
        tabCount={2}
        onActivate={() => activation.handleActivateBrowserTab(workspace.id)}
        onClose={() => {}}
        onCloseOthers={() => {}}
        onCloseToRight={() => {}}
        onCloseToLeft={() => {}}
        onTogglePin={() => {}}
        dragData={{
          kind: 'tab',
          tabType: 'browser',
          visibleTabId: workspace.id,
          label: workspace.title,
          worktreeId: worktree,
          groupId: unified.groupId,
          unifiedTabId: unified.id
        }}
      />
    </TooltipProvider>
  )
}

function mount() {
  const view = render(<Fixture />)
  const target = view.container.querySelector('[data-tab-id]')
  if (!(target instanceof HTMLElement)) {
    throw new Error('BrowserTab did not mount')
  }
  return { ...view, target }
}
function release(x = 11, y = 11) {
  fireEvent.pointerUp(window, { clientX: x, clientY: y, button: 0 })
}

describe('BrowserTab compound pointer scope', () => {
  beforeEach(() => {
    installClientHostedPaneApi({ browser: { notifyActiveTabChanged: vi.fn(async () => {}) } })
    useAppStore.setState({
      settings: getDefaultSettings('/fixture'),
      persistedUIReady: true,
      activeWorktreeId: worktree,
      activeWorkspaceExecutionHostId: 'local',
      folderWorkspaces: [makeFolderWorkspace({ id: 'pointer-fixture', executionHostId: 'local' })]
    })
    const state = useAppStore.getState()
    originalWorkspace = state.createBrowserTab(worktree, 'https://fixture.invalid/first').id
    targetWorkspace = state.createBrowserTab(worktree, 'https://fixture.invalid/second').id
    state.setActiveBrowserTab(originalWorkspace)
    drag.begin.mockClear()
  })
  afterEach(() => {
    cleanup()
    useAppStore.setState(initial, true)
    if (originalApi) {
      Object.defineProperty(window, 'api', originalApi)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  })

  it('starts the drag listener immediately but activates the actual controller only on release', () => {
    const { target } = mount()
    fireEvent.pointerDown(target, { clientX: 10, clientY: 10, button: 0 })
    expect(drag.begin).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().activeBrowserTabIdByWorktree[worktree]).toBe(originalWorkspace)
    release()
    expect(useAppStore.getState().activeBrowserTabIdByWorktree[worktree]).toBe(targetWorkspace)
    expect(useAppStore.getState().activeTabTypeByWorktree[worktree]).toBe('browser')
  })

  it('does not activate or reorder merely because the release travelled beyond the threshold', () => {
    const { target } = mount()
    const order = useAppStore
      .getState()
      .groupsByWorktree[worktree]?.map((group) => [...group.tabOrder])
    fireEvent.pointerDown(target, { clientX: 10, clientY: 10, button: 0 })
    release(200, 10)
    expect(drag.begin).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().activeBrowserTabIdByWorktree[worktree]).toBe(originalWorkspace)
    expect(
      useAppStore.getState().groupsByWorktree[worktree]?.map((group) => group.tabOrder)
    ).toEqual(order)
  })

  it.each(['cancel', 'blur', 'unmount'])('does not activate after pending pointer %s', (ending) => {
    const { target, unmount } = mount()
    fireEvent.pointerDown(target, { clientX: 10, clientY: 10, button: 0 })
    if (ending === 'unmount') {
      unmount()
    } else {
      fireEvent(window, new Event(ending === 'cancel' ? 'pointercancel' : 'blur'))
    }
    release()
    expect(useAppStore.getState().activeBrowserTabIdByWorktree[worktree]).toBe(originalWorkspace)
  })

  it('typed activation reuses the callback but never begins a pointer/DnD gesture', async () => {
    mount()
    const { workspace, unified } = owner()
    await act(async () => {
      await expect(
        requestBrowserTabUi(
          { worktree, workspace: workspace.id, unifiedTab: unified.id, group: unified.groupId },
          'activate',
          Date.now() + 1000
        )
      ).resolves.toMatchObject({ activeWorkspace: workspace.id, activeTab: unified.id })
    })
    expect(drag.begin).not.toHaveBeenCalled()
    expect(useAppStore.getState().activeBrowserTabIdByWorktree[worktree]).toBe(targetWorkspace)
  })
})
