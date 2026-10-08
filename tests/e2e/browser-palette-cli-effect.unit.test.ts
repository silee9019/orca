// @vitest-environment happy-dom
import { act, createElement, Fragment, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import { useWorktreeJumpPaletteSelectionActions } from '../../src/renderer/src/components/use-worktree-jump-palette-selection-actions'
import { useBrowserPageChromeFocus } from '../../src/renderer/src/components/browser-pane/assemble-chrome/use-browser-page-chrome-focus'
import { useElementGuestFocus } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-page-guest-focus'
import { requestBrowserFocus } from '../../src/renderer/src/components/browser-pane/host-guest/browser-focus'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 72
      isDestroyed = () => false
      webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
    }
  }
})
import { BrowserWindow, ipcMain } from 'electron'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { requestBrowserViewerFromRenderer } from '../../src/main/window/browser-viewer-request-relay'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import type { BrowserViewerRequest } from '../../src/shared/browser-viewer-command'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'

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
      return createElement(
        Fragment,
        null,
        createElement('input', { ref: input, defaultValue: url }),
        createElement('div', { ref: guest, tabIndex: 0, 'data-guest': true }),
        modal === 'worktree-palette' ? createElement(PaletteOwner) : null
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
    const fixtureWindow = new BrowserWindow()
    const runtime = new OrcaRuntimeService()
    runtime.setNotifier({
      browserViewer: (command) => requestBrowserViewerFromRenderer(fixtureWindow, command)
    })
    vi.mocked(fixtureWindow.webContents.send).mockImplementation(
      (_channel, request: BrowserViewerRequest) => {
        void applyBrowserViewerRequest(request).then(
          (result) =>
            ipcMain.emit(
              'ui:browserViewerResponse',
              { sender: fixtureWindow.webContents },
              { id: request.id, ok: true, result }
            ),
          (error: unknown) =>
            ipcMain.emit(
              'ui:browserViewerResponse',
              { sender: fixtureWindow.webContents },
              {
                id: request.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error)
              }
            )
        )
      }
    )
    const cli = await createRemotePaneCliSocket(runtime)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = (host = target.executionHostId) =>
      cli.runPalette([
        '--execution-host',
        host,
        '--worktree',
        target.worktreeId,
        '--workspace',
        target.workspaceId,
        '--page',
        target.pageId
      ])
    try {
      await act(async () => root.render(createElement(Owner)))
      let pending: Promise<void> | undefined
      act(() => {
        pending = run()
        void pending.catch(() => {})
      })
      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))
        })
      }
      await pending
      const printed = output.mock.lastCall?.[0]
      if (typeof printed !== 'string') {
        throw new Error('Missing receipt')
      }
      expect(JSON.parse(printed)).toMatchObject({
        result: {
          applied: true,
          paletteState: {
            pageId,
            focusApplied: true,
            focusTarget: url === 'about:blank' ? 'address-bar' : 'webview'
          }
        }
      })
      expect(document.activeElement).toBe(
        container.querySelector(url === 'about:blank' ? 'input' : '[data-guest]')
      )
      expect(useAppStore.getState().activeModal).toBe('none')
      expect(skipRestoreFocusRef.current).toBe(true)
      expect(selected).toHaveBeenCalledWith('')
      await expect(
        cli.runPalette([
          '--execution-host',
          'ssh:wrong',
          '--worktree',
          target.worktreeId,
          '--workspace',
          target.workspaceId,
          '--page',
          target.pageId
        ])
      ).rejects.toThrow('target_unavailable')
      cli.useLegacyPeer()
      await expect(run()).rejects.toThrow('does not support Palette')
    } finally {
      await cli.close()
      output.mockRestore()
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
