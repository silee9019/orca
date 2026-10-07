// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, cleanup, render } from '@testing-library/react'
import { createElement, useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@/runtime/runtime-rpc-client', async () => ({
  callRuntimeRpc: vi.fn(async () => ({ ok: true })),
  RuntimeRpcCallError: (await import('@/runtime/runtime-rpc-result')).RuntimeRpcCallError
}))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 19
      isDestroyed = () => false
      webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
    }
  }
})
import { BrowserWindow, ipcMain } from 'electron'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { requestBrowserViewerFromRenderer } from '../../src/main/window/browser-viewer-request-relay'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import {
  RemoteBrowserPageContextMenu,
  useRemoteBrowserPageContextMenu
} from '../../src/renderer/src/components/browser-pane/stream-remote/remote-browser-page-context-menu'
import { useRemoteBrowserPageInput } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-page-input'
import { useRemoteBrowserPageInputQueue } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-input-queue'
import { createHarness } from '../../src/renderer/src/components/browser-pane/stream-remote/remote-browser-stream-lifecycle-test-harness'
import { useRemoteBrowserPageNavigation } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-page-navigation'
import { useRemoteBrowserPaneCommands } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-pane-commands'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import type { BrowserViewerRequest } from '../../src/shared/browser-viewer-command'
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('routes remote context menu CLI through actual inspection/menu/navigation owners and provider read-back', async () => {
  expect(initial.activeModal).toBe('none')
  const provider: {
    clipboard: string
    external: string[]
    navigated: string[]
    inspections: number
    inspectionUnavailable: boolean
    opened: string[]
  } = {
    clipboard: '',
    external: [],
    navigated: [],
    inspections: 0,
    inspectionUnavailable: false,
    opened: []
  }
  Object.defineProperty(globalThis.window, 'api', {
    configurable: true,
    value: {
      ui: {
        set: async () => ({}),
        writeClipboardText: async (text: string) => {
          provider.clipboard = text
        }
      },
      shell: {
        openUrl: async (url: string) => {
          provider.external.push(url)
        }
      }
    }
  })
  vi.mocked(callRuntimeRpc).mockImplementation(async (target, method) => {
    expect(target).toEqual({ kind: 'environment', environmentId: 'env-1' })
    if (method === 'browser.eval') {
      provider.inspections++
      if (provider.inspectionUnavailable) {
        throw new Error('method_not_found')
      }
      return {
        result: JSON.stringify({
          linkUrl: 'https://link.invalid/',
          pageUrl: 'https://page.invalid/',
          selectionText: 'selected'
        })
      }
    }
    provider.navigated.push(method)
    return { url: 'https://navigated.invalid/', title: 'Navigated' }
  })
  const window = new BrowserWindow()
  const runtime = new OrcaRuntimeService()
  runtime.setNotifier({
    browserViewer: (command) => requestBrowserViewerFromRenderer(window, command)
  })
  vi.mocked(window.webContents.send).mockImplementation(
    (_channel, request: BrowserViewerRequest) => {
      void applyBrowserViewerRequest(request).then(
        (result) =>
          ipcMain.emit(
            'ui:browserViewerResponse',
            { sender: window.webContents },
            { id: request.id, ok: true, result }
          ),
        (error: unknown) =>
          ipcMain.emit(
            'ui:browserViewerResponse',
            { sender: window.webContents },
            {
              id: request.id,
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            }
          )
      )
    }
  )
  const page = {
    id: 'local-page',
    workspaceId: 'workspace',
    worktreeId: 'folder',
    url: 'https://fixture.invalid/',
    title: 'Fixture',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    createdAt: 1,
    loadError: { code: -202, description: 'certificate', validatedUrl: 'https://fixture.invalid/' }
  }
  useAppStore.setState(
    {
      ...initial,
      persistedUIReady: true,
      settings: { ...getDefaultSettings('/fixture/home'), activeRuntimeEnvironmentId: 'env-1' },
      browserPagesByWorkspace: { workspace: [page] },
      remoteBrowserPageHandlesByPageId: {
        'local-page': { environmentId: 'env-1', remotePageId: 'page-1' }
      }
    },
    true
  )
  const initialPage = useAppStore.getState().browserPagesByWorkspace.workspace[0]
  useAppStore.setState({
    browserTabsByWorktree: {
      folder: [
        { ...initialPage, id: 'workspace', activePageId: initialPage.id, pageIds: [initialPage.id] }
      ]
    }
  })
  const harness = createHarness()
  harness.lifecycle.tokens.setRemotePage('page-1')
  function Owner() {
    const image = useRef<HTMLImageElement>(null)
    const viewport = useRef<HTMLDivElement>(null)
    const queue = useRemoteBrowserPageInputQueue()
    const currentPage = useAppStore((state) => state.browserPagesByWorkspace.workspace[0])
    const navigation = useRemoteBrowserPageNavigation({
      browserTab: currentPage,
      stagedPage: false,
      addressBarValue: currentPage.url,
      setAddressBarValueFromPage: () => {},
      lifecycle: harness.lifecycle,
      runtimeWorktree: 'folder:fixture',
      runtimeTarget: () => ({ kind: 'environment', environmentId: 'env-1' }),
      createRemoteOperationToken: (id) => harness.lifecycle.tokens.createOperationToken(id),
      isCurrentRemoteOperationToken: (token) => harness.lifecycle.tokens.isCurrent(token),
      closeMissingRemotePage: () => {},
      onSetUrl: useAppStore.getState().setBrowserPageUrl,
      onUpdatePageState: useAppStore.getState().updateBrowserPageState,
      setPaneNotice: () => {},
      setPaneBusy: () => {}
    })
    const input = useRemoteBrowserPageInput({
      busy: false,
      imageRef: image,
      remoteViewportRef: viewport,
      remoteCssViewportSizeRef: useRef({ width: 800, height: 600 }),
      remoteViewportSizeRef: useRef(null),
      frameMetadata: null,
      runtimeTarget: () => ({ kind: 'environment', environmentId: 'env-1' }),
      lifecycle: harness.lifecycle,
      runtimeWorktree: 'folder:fixture',
      enqueueRemoteInput: queue.enqueueRemoteInput,
      createRemoteOperationToken: (id) => harness.lifecycle.tokens.createOperationToken(id),
      isCurrentRemoteOperationToken: (token) => harness.lifecycle.tokens.isCurrent(token),
      closeMissingRemotePage: () => {},
      scheduleRemoteTabInfoRefresh: () => {},
      setPaneNotice: () => {}
    })
    const menu = useRemoteBrowserPageContextMenu({
      commandOwner: {
        page: 'local-page',
        environmentId: 'env-1',
        remotePageId: 'page-1',
        active: true
      },
      onNavigate: (method) => navigation.runRemoteNavigation(method, undefined, () => true),
      onOpenLink: async (url) => {
        provider.opened.push(url)
      },
      busy: false,
      browserTabUrl: currentPage.url,
      imageRef: image,
      runtimeTarget: () => ({ kind: 'environment', environmentId: 'env-1' }),
      lifecycle: harness.lifecycle,
      runtimeWorktree: 'folder:fixture',
      getRemoteImagePoint: input.getRemoteImagePoint,
      enqueueRemoteInput: queue.enqueueRemoteInput,
      createRemoteOperationToken: (id) => harness.lifecycle.tokens.createOperationToken(id),
      isCurrentRemoteOperationToken: (token) => harness.lifecycle.tokens.isCurrent(token),
      closeMissingRemotePage: () => {},
      mountedRef: useRef(true),
      setPaneNotice: () => {}
    })
    useRemoteBrowserPaneCommands({
      page: 'local-page',
      environmentId: 'env-1',
      remotePageId: 'page-1',
      active: true,
      staged: false,
      streamStatus: { kind: 'live' },
      reconnectGeneration: 0,
      reconnect: () => {},
      performMenu: menu.performMenu
    })
    return createElement(
      'div',
      { ref: viewport, 'data-testid': 'viewport' },
      createElement('img', { ref: image, alt: 'remote frame', tabIndex: 0 }),
      menu.contextMenu
        ? createElement(RemoteBrowserPageContextMenu, {
            contextMenu: menu.contextMenu,
            actions: menu.actions,
            onDismiss: () => menu.setContextMenu(null),
            onNavigate: () => {},
            onOpenLinkInOrcaBrowser: () => {}
          })
        : null
    )
  }
  const view = render(createElement(Owner))
  vi.spyOn(view.getByTestId('viewport'), 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 300)
  )
  vi.spyOn(view.getByAltText('remote frame'), 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 300)
  )
  const cli = await createRemotePaneCliSocket(runtime)
  try {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = async (action: string) => {
      let result: Promise<unknown> | undefined
      await act(async () => {
        result = cli.run('env-1', 'menu', 'page-1', [
          '--menu-action',
          action,
          '--x',
          '20',
          '--y',
          '30'
        ])
        void result.catch(() => {})
        await new Promise((resolve) => setTimeout(resolve, 30))
      })
      return result
    }
    await run('open')
    expect(view.queryByRole('menu')).not.toBeNull()
    expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"inspected": true'))
    await run('copy-link')
    expect(provider.clipboard).toBe('https://link.invalid/')
    expect(view.queryByRole('menu')).toBeNull()
    for (const action of [
      'copy-page',
      'copy-selection',
      'external-link',
      'external-page',
      'back',
      'forward',
      'reload',
      'open-orca'
    ]) {
      await run('open')
      await run(action)
      expect(view.queryByRole('menu')).toBeNull()
    }
    expect(provider.clipboard).toBe('selected')
    expect(provider.external).toEqual(['https://link.invalid/', 'https://page.invalid/'])
    expect(provider.navigated).toEqual(['browser.back', 'browser.forward', 'browser.reload'])
    expect(useAppStore.getState().browserPagesByWorkspace.workspace[0].url).toBe(
      'https://navigated.invalid/'
    )
    expect(provider.opened).toEqual(['https://link.invalid/'])
    provider.inspectionUnavailable = true
    await run('open')
    expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"inspected": false'))
    await expect(run('copy-link')).rejects.toThrow('remote_browser_context_menu_item_unavailable')
    await run('dismiss')
    expect(view.queryByRole('menu')).toBeNull()
    expect(ipcMain.listenerCount('ui:browserViewerResponse')).toBe(0)
  } finally {
    view.unmount()
    await cli.close()
  }
})
