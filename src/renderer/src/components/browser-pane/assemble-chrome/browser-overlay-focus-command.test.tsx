// @vitest-environment happy-dom
import { makeFolderWorkspace } from '@/store/slices/worktrees-slice-test-fixtures'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { seedBrowserOverlayFocusOwner } from './browser-overlay-focus.test-fixture'
import {
  BrowserOverlayFocusEvent,
  requestBrowserOverlayFocus
} from '@/runtime/browser-overlay-focus-request'
vi.mock('./browser-workspace-pane', () => ({ default: () => <span data-fixture-pane /> }))
vi.mock('../host-guest/browser-automation-visibility', () => ({
  useBrowserAutomationVisibilityForAny: () => false
}))
vi.mock('@/lib/pane-manager/browser-mobile-driver-state', () => ({
  useBrowserMobileDriverForAny: () => false
}))
vi.mock('@/lib/pane-manager/browser-remote-viewer-state', () => ({
  useBrowserRemoteViewerForAny: () => false
}))
import BrowserPaneOverlayLayer from './BrowserPaneOverlayLayer'
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('uses the actual overlay slot callback and acknowledges the real focused group store', () => {
  const target = seedBrowserOverlayFocusOwner()
  useAppStore.setState({ activeGroupIdByWorktree: { 'folder:fixture': 'other' } })
  render(<BrowserPaneOverlayLayer worktreeId="folder:fixture" isWorktreeActive />)
  act(() =>
    expect(requestBrowserOverlayFocus(target, Date.now() + 5000)).toMatchObject({
      ...target,
      focused: true
    })
  )
  expect(useAppStore.getState().activeGroupIdByWorktree[target.worktreeId]).toBe(target.groupId)
  expect(useAppStore.getState().activeBrowserTabIdByWorktree[target.worktreeId]).toBe(
    target.workspaceId
  )
  expect(useAppStore.getState().activeTabTypeByWorktree[target.worktreeId]).toBe('browser')
})
it('refuses stale group/host, modal, expired, hidden and disposed offers before focus', () => {
  const target = seedBrowserOverlayFocusOwner()
  const view = render(<BrowserPaneOverlayLayer worktreeId="folder:fixture" isWorktreeActive />)
  expect(() =>
    requestBrowserOverlayFocus({ ...target, groupId: 'other' }, Date.now() + 5000)
  ).toThrow()
  expect(() =>
    requestBrowserOverlayFocus({ ...target, executionHostId: 'ssh:other' }, Date.now() + 5000)
  ).toThrow()
  expect(() => requestBrowserOverlayFocus(target, Date.now() - 1)).toThrow()
  useAppStore.setState({ activeModal: 'create-worktree' })
  expect(() => requestBrowserOverlayFocus(target, Date.now() + 5000)).toThrow()
  useAppStore.setState({ activeModal: 'none' })
  const event = new BrowserOverlayFocusEvent(target, Date.now() + 5000)
  window.dispatchEvent(event)
  expect(event.offers).toHaveLength(1)
  view.unmount()
  expect(() => event.offers[0]()).toThrow('disposed')
  render(<BrowserPaneOverlayLayer worktreeId="folder:fixture" isWorktreeActive={false} />)
  expect(() => requestBrowserOverlayFocus(target, Date.now() + 5000)).toThrow()
})
it.each(['ssh:fixture', 'runtime:fixture'] as const)(
  'preserves the explicit %s folder owner without native execution',
  (executionHostId) => {
    const target = seedBrowserOverlayFocusOwner()
    useAppStore.setState({
      activeWorkspaceExecutionHostId: executionHostId,
      folderWorkspaces: [makeFolderWorkspace({ id: 'fixture', executionHostId })]
    })
    render(<BrowserPaneOverlayLayer worktreeId="folder:fixture" isWorktreeActive />)
    act(() =>
      expect(
        requestBrowserOverlayFocus({ ...target, executionHostId }, Date.now() + 5000)
      ).toMatchObject({ executionHostId, focused: true })
    )
  }
)
it('rejects an offered request after its browser-to-group assignment changes', () => {
  const target = seedBrowserOverlayFocusOwner()
  render(<BrowserPaneOverlayLayer worktreeId="folder:fixture" isWorktreeActive />)
  const event = new BrowserOverlayFocusEvent(target, Date.now() + 5000)
  window.dispatchEvent(event)
  const state = useAppStore.getState()
  act(() =>
    useAppStore.setState({
      groupsByWorktree: {
        ...state.groupsByWorktree,
        [target.worktreeId]: state.groupsByWorktree[target.worktreeId].map((group) => ({
          ...group,
          activeTabId: null,
          tabOrder: []
        }))
      }
    })
  )
  expect(() => event.offers[0]()).toThrow('target_changed')
})
