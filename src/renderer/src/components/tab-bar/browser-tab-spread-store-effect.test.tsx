// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as Sortable from '@dnd-kit/sortable'
import type { Tab, TabGroup } from '../../../../shared/tab-types'
import type { BrowserWorkspace } from '../../../../shared/browser-workspace-types'
import { getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '../../store'
import { i18n } from '../../i18n/i18n'
import { ConfirmationDialogProvider } from '../confirmation-dialog'
import TabGroupPanel from '../tab-group/TabGroupPanel'
import { TooltipProvider } from '../ui/tooltip'
import { requestBrowserTabUi } from '../../runtime/browser-tab-ui-request'

const boundary = vi.hoisted(() => ({ cleanup: vi.fn(), detectedIds: [] }))
vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({ detectedIds: boundary.detectedIds })
}))
vi.mock('@/store/slices/browser-webview-cleanup', () => ({
  destroyWorkspaceWebviews: boundary.cleanup
}))
vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof Sortable>()
  return { ...actual, useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {} }) }
})
const worktree = 'folder:spread-store'
const groupId = 'group:spread-store'
const ids = ['pinned', 'left', 'target', 'right']
const originalLanguage = i18n.language
let previousStore = useAppStore.getState()
let previousApi: PropertyDescriptor | undefined
function tab(id: string, group = groupId): Tab {
  return {
    id,
    entityId: `ws-${id}`,
    groupId: group,
    worktreeId: worktree,
    contentType: 'browser',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: ids.indexOf(id),
    createdAt: 1,
    isPinned: id === 'pinned'
  }
}
function workspace(id: string): BrowserWorkspace {
  return {
    id: `ws-${id}`,
    worktreeId: worktree,
    url: `https://fixture.invalid/${id}`,
    title: id,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1,
    sessionProfileId: 'fake',
    sessionPartition: 'persist:fake'
  }
}
function Owner() {
  return (
    <ConfirmationDialogProvider>
      <TooltipProvider>
        <TabGroupPanel
          worktreeId={worktree}
          groupId={groupId}
          isVisible
          isFocused
          hasSplitGroups
          touchesRightEdge
          touchesLeftEdge
          reserveClosedExplorerToggleSpace={false}
          reserveCollapsedSidebarHeaderSpace={false}
        />
      </TooltipProvider>
    </ConfirmationDialogProvider>
  )
}
beforeEach(async () => {
  previousStore = useAppStore.getState()
  previousApi = Object.getOwnPropertyDescriptor(window, 'api')
  await i18n.changeLanguage('en')
  const group: TabGroup = {
    id: groupId,
    worktreeId: worktree,
    tabOrder: ids,
    activeTabId: 'target'
  }
  const other: TabGroup = {
    id: 'other-group',
    worktreeId: worktree,
    tabOrder: ['other'],
    activeTabId: 'other'
  }
  useAppStore.setState({
    settings: getDefaultSettings('/fake-profile'),
    persistedUIReady: true,
    activeModal: 'none',
    activeView: 'terminal',
    activeWorktreeId: worktree,
    unifiedTabsByWorktree: {
      [worktree]: [...ids.map((id) => tab(id)), tab('other', 'other-group')]
    },
    groupsByWorktree: { [worktree]: [group, other] },
    activeGroupIdByWorktree: { [worktree]: groupId },
    browserTabsByWorktree: { [worktree]: [...ids, 'other'].map(workspace) },
    browserPagesByWorkspace: {},
    activeBrowserTabIdByWorktree: { [worktree]: 'ws-target' },
    activeTabTypeByWorktree: { [worktree]: 'browser' }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { set: vi.fn(async () => {}) } }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(previousStore, true)
  expect(useAppStore.getState()).toBe(previousStore)
  if (previousApi) {
    Object.defineProperty(window, 'api', previousApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
  vi.clearAllMocks()
})
afterAll(async () => {
  await i18n.changeLanguage(originalLanguage)
})
function row() {
  const target = document.querySelector('[data-tab-id="ws-target"]')
  if (!(target instanceof HTMLElement)) {
    throw new Error('Actual BrowserTab row missing')
  }
  return target
}
function menu(label: string) {
  fireEvent.contextMenu(row(), { clientX: 10, clientY: 10 })
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}
const target = { workspace: 'ws-target', worktree, group: groupId, unifiedTab: 'target' }
it('pins and unpins through actual TabBar actions and reads the Store and DOM order', async () => {
  render(<Owner />)
  menu('Pin Tab')
  await waitFor(() => expect(row().dataset.pinned).toBe('true'))
  expect(useAppStore.getState().getTab('target')?.isPinned).toBe(true)
  expect(useAppStore.getState().groupsByWorktree[worktree][0].tabOrder).toEqual([
    'pinned',
    'target',
    'left',
    'right'
  ])
  let receipt
  await act(async () => {
    receipt = await requestBrowserTabUi(target, 'toggle-pin', Date.now() + 5000)
  })
  expect(receipt).toMatchObject({ pinned: false, exists: true })
  expect(useAppStore.getState().getTab('target')?.isPinned).toBe(false)
  await waitFor(() => expect(row().dataset.pinned).toBe('false'))
  expect(boundary.cleanup).not.toHaveBeenCalled()
  expect(
    [...document.querySelectorAll('[data-tab-id]')].map((element) =>
      element.getAttribute('data-tab-id')
    )
  ).toEqual(useAppStore.getState().groupsByWorktree[worktree][0].tabOrder.map((id) => `ws-${id}`))
})
const closeCases = [
  ['Close Others', 'close-others', ['left', 'right']],
  ['Close Tabs To The Right', 'close-right', ['right']],
  ['Close Tabs To The Left', 'close-left', ['left']]
] as const
it.each(
  closeCases.flatMap(([label, action, closed]) =>
    ['DOM', 'typed'].map((mode) => ({ label, action, closed, mode }))
  )
)(
  'closes $label via $mode and actual scope actions with Store readback',
  async ({ label, action, closed, mode }) => {
    render(<Owner />)
    if (mode === 'typed') {
      let changed
      await act(async () => {
        changed = await requestBrowserTabUi(target, action, Date.now() + 5000)
      })
      expect(changed).toMatchObject({ exists: true, closedTabs: [...closed] })
    } else {
      menu(label)
    }
    const expected = [...ids, 'other'].filter((id) => !closed.some((value) => value === id))
    await waitFor(() =>
      expect(useAppStore.getState().unifiedTabsByWorktree[worktree].map((tab) => tab.id)).toEqual(
        expected
      )
    )
    expect(useAppStore.getState().browserTabsByWorktree[worktree].map((tab) => tab.id)).toEqual(
      expected.map((id) => `ws-${id}`)
    )
    expect(useAppStore.getState().groupsByWorktree[worktree][0].tabOrder).toEqual(
      ids.filter((id) => !closed.some((value) => value === id))
    )
    expect(boundary.cleanup.mock.calls.map((call) => call[1])).toEqual(
      closed.map((id) => `ws-${id}`)
    )
    for (const id of closed) {
      expect(document.querySelector(`[data-tab-id="ws-${id}"]`)).toBeNull()
    }
    expect(useAppStore.getState().getTab('pinned')?.isPinned).toBe(true)
    let receipt
    await act(async () => {
      receipt = await requestBrowserTabUi(target, action, Date.now() + 5000)
    })
    expect(receipt).toMatchObject({ exists: true, closedTabs: [] })
    expect(useAppStore.getState().unifiedTabsByWorktree[worktree].map((tab) => tab.id)).toEqual(
      expected
    )
  }
)
