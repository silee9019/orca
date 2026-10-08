// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../shared/constants'
import { useWorktreeJumpPaletteSelectionActions } from '../components/use-worktree-jump-palette-selection-actions'
import { useBrowserPageChromeFocus } from '../components/browser-pane/assemble-chrome/use-browser-page-chrome-focus'
import { useElementGuestFocus } from '../components/browser-pane/assemble-chrome/browser-page-guest-focus'
import { requestBrowserFocus } from '../components/browser-pane/host-guest/browser-focus'
import { applyBrowserPaletteSelection } from './browser-palette-selection'

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
it.each(['about:blank', 'https://fixture.invalid'])(
  'reuses exact Palette activation and actual chrome focus owner for %s',
  async (url) => {
    const initial = useAppStore.getState()
    const api = Object.getOwnPropertyDescriptor(window, 'api')
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { set: async () => {}, onFocusBrowserAddressBar: () => () => {} } }
    })
    useAppStore.setState({
      settings: getDefaultSettings('/fixture/home'),
      persistedUIReady: true,
      folderWorkspaces: [
        {
          id: 'palette',
          projectGroupId: 'project',
          name: 'Folder',
          folderPath: '/fixture/folder',
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
      ]
    })
    const worktree = useAppStore.getState().getKnownWorktreeById('folder:palette', 'local')
    if (!worktree) {
      throw new Error('Missing folder workspace')
    }
    useAppStore.setState({
      activeWorktreeId: worktree.id,
      activeRepoId: worktree.repoId,
      groupsByWorktree: {
        [worktree.id]: [{ id: 'group', worktreeId: worktree.id, activeTabId: null, tabOrder: [] }]
      }
    })
    const tab = useAppStore.getState().createBrowserTab(worktree.id, url, { activate: true })
    if (!tab.activePageId) {
      throw new Error('Missing page')
    }
    const pageId = tab.activePageId
    const skipRestoreFocusRef = { current: false }
    const selected = vi.fn()
    function PaletteOwner() {
      useWorktreeJumpPaletteSelectionActions({
        closeModal: useAppStore.getState().closeModal,
        recordFeatureInteraction: vi.fn(),
        openSettingsTarget: vi.fn(),
        openSettingsPage: vi.fn(),
        revealSidebarRow: vi.fn(),
        skipRestoreFocusRef,
        setSelectedItemId: selected,
        previousActiveTabTypeRef: useRef<'terminal'>('terminal'),
        previousBrowserPageIdRef: useRef<string | null>(null),
        previousBrowserFocusTargetRef: useRef<'webview'>('webview'),
        previousWorktreeIdRef: useRef<string | null>(null),
        previousFocusElementRef: useRef<HTMLElement | null>(null),
        focusFallbackSurface: vi.fn(),
        requestBrowserFocus,
        buildQuickActionContext: vi.fn()
      })
      return null
    }
    function Owner() {
      const modal = useAppStore((state) => state.activeModal)
      const input = useRef<HTMLInputElement>(null)
      const guest = useRef<HTMLDivElement>(null)
      const guestFocus = useElementGuestFocus(guest)
      useBrowserPageChromeFocus({
        browserTabId: pageId,
        workspaceId: tab.id,
        isActive: true,
        chromeShortcutScope: 'focused',
        addressBarInputRef: input,
        guestFocus
      })
      return (
        <>
          <input ref={input} defaultValue={url} />
          <div ref={guest} tabIndex={0} data-guest />
          {modal === 'worktree-palette' ? <PaletteOwner /> : null}
        </>
      )
    }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const target = {
      executionHostId: 'local' as const,
      worktreeId: worktree.id,
      workspaceId: tab.id,
      pageId
    }
    try {
      await act(async () => root.render(<Owner />))
      let pending: ReturnType<typeof applyBrowserPaletteSelection> | undefined
      act(() => {
        pending = applyBrowserPaletteSelection(target, Date.now() + 5000)
        void pending.catch(() => {})
      })
      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))
        })
      }
      await expect(pending).resolves.toMatchObject({
        pageId,
        focusApplied: true,
        focusTarget: url === 'about:blank' ? 'address-bar' : 'webview'
      })
      expect(document.activeElement).toBe(
        container.querySelector(url === 'about:blank' ? 'input' : '[data-guest]')
      )
      expect(useAppStore.getState().activeModal).toBe('none')
      expect(skipRestoreFocusRef.current).toBe(true)
      expect(selected).toHaveBeenCalledWith('')
      await expect(
        applyBrowserPaletteSelection({ ...target, executionHostId: 'ssh:wrong' }, Date.now() + 5000)
      ).rejects.toThrow()
      const calls = selected.mock.calls.length
      await act(async () => {
        useAppStore.getState().openModal('add-repo')
      })
      await expect(applyBrowserPaletteSelection(target, Date.now() + 5000)).rejects.toThrow(
        'viewer_busy'
      )
      expect(selected).toHaveBeenCalledTimes(calls)
      await act(async () => {
        useAppStore.getState().closeModal()
      })
      await expect(applyBrowserPaletteSelection(target, Date.now() - 1)).rejects.toThrow(
        'target_unavailable'
      )
      let raced: Promise<unknown> | undefined
      act(() => {
        raced = applyBrowserPaletteSelection(target, Date.now() + 5000)
        void raced.catch(() => {})
        useAppStore.setState({ folderWorkspaces: [] })
      })
      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))
        })
      }
      await expect(raced).rejects.toThrow('target_changed')
      expect(selected).toHaveBeenCalledTimes(calls)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      useAppStore.setState(initial, true)
      if (api) {
        Object.defineProperty(window, 'api', api)
      } else {
        Reflect.deleteProperty(window, 'api')
      }
    }
  }
)
