// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, cleanup, render } from '@testing-library/react'
import { createElement, useRef, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@/runtime/runtime-rpc-client', async () => ({
  callRuntimeRpc: vi.fn(async () => ({})),
  RuntimeRpcCallError: (await import('@/runtime/runtime-rpc-result')).RuntimeRpcCallError
}))
vi.mock('@/hooks/use-window-stream-visibility', () => ({ useWindowStreamVisible: () => true }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 17
      isDestroyed = () => false
      webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
    }
  }
})
import { BrowserWindow, ipcMain } from 'electron'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import BrowserAddressBar from '../../src/renderer/src/components/browser-pane/assemble-chrome/BrowserAddressBar'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { requestBrowserViewerFromRenderer } from '../../src/main/window/browser-viewer-request-relay'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { createHarness } from '../../src/renderer/src/components/browser-pane/stream-remote/remote-browser-stream-lifecycle-test-harness'
import { useRemoteBrowserPageStream } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-page-stream'
import { useRemoteBrowserPageNavigation } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-page-navigation'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  useRemoteBrowserPageInput,
  useRemoteBrowserPageInputQueue
} from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-page-input'
import { useRemoteBrowserPaneCommands } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-pane-commands'
import type { BrowserViewerRequest } from '../../src/shared/browser-viewer-command'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
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
it('runs CLI parser/socket/dispatcher/service/relay/owner read-back without borrowing another viewer', async () => {
  Object.defineProperty(globalThis.window, 'api', {
    configurable: true,
    value: { ui: { set: async () => ({}) } }
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
  useAppStore.setState(
    {
      ...initial,
      persistedUIReady: true,
      settings: { ...getDefaultSettings('/fixture/home'), activeRuntimeEnvironmentId: 'env-1' },
      browserPagesByWorkspace: {
        workspace: [
          {
            id: 'local-page',
            workspaceId: 'workspace',
            worktreeId: 'folder',
            url: 'https://fixture.invalid',
            title: 'Fixture',
            loading: false,
            faviconUrl: null,
            canGoBack: false,
            canGoForward: false,
            loadError: null,
            createdAt: 1,
            browserRuntimeEnvironmentId: 'env-1'
          }
        ]
      },
      remoteBrowserPageHandlesByPageId: {}
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
  harness.identity.tabId = 'local-page'
  harness.setCapabilities([])
  const provider: {
    held: boolean
    keys: string[]
    points: unknown[]
    url: string
    title: string
    failNavigation: boolean
    history: string[]
    historyIndex: number
  } = {
    held: false,
    keys: [],
    points: [],
    url: 'https://fixture.invalid',
    title: 'Fixture',
    failNavigation: false,
    history: ['https://fixture.invalid'],
    historyIndex: 0
  }
  vi.mocked(callRuntimeRpc).mockImplementation(async (_target, method, params) => {
    if (method === 'browser.mouseMove') {
      provider.points.push(params)
    }
    if (method === 'browser.mouseDown') {
      provider.held = true
    }
    if (method === 'browser.mouseUp') {
      provider.held = false
    }
    if (
      method === 'browser.keypress' &&
      typeof params === 'object' &&
      params &&
      'key' in params &&
      typeof params.key === 'string'
    ) {
      provider.keys.push(params.key)
    }
    if (['browser.goto', 'browser.back', 'browser.forward', 'browser.reload'].includes(method)) {
      if (provider.failNavigation) {
        throw new Error('fixture navigation failed')
      }
      if (
        method === 'browser.goto' &&
        typeof params === 'object' &&
        params &&
        'url' in params &&
        typeof params.url === 'string'
      ) {
        provider.history = [...provider.history.slice(0, provider.historyIndex + 1), params.url]
        provider.historyIndex += 1
      }
      if (method === 'browser.back') {
        provider.historyIndex = Math.max(0, provider.historyIndex - 1)
      }
      if (method === 'browser.forward') {
        provider.historyIndex = Math.min(provider.history.length - 1, provider.historyIndex + 1)
      }
      provider.url = provider.history[provider.historyIndex]
      return { url: provider.url, title: provider.title }
    }
    return {}
  })
  const refresh = vi.fn()
  const clearPendingRemoteWheel = vi.fn()
  function Owner() {
    const viewport = useRef<HTMLDivElement>(null)
    const image = useRef<HTMLImageElement>(null)
    const queue = useRemoteBrowserPageInputQueue()
    const browserTab = useAppStore((state) => state.browserPagesByWorkspace.workspace[0])
    const [address, setAddress] = useState(browserTab.url)
    const navigation = useRemoteBrowserPageNavigation({
      browserTab,
      stagedPage: false,
      addressBarValue: address,
      setAddressBarValueFromPage: setAddress,
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
      scheduleRemoteTabInfoRefresh: refresh,
      setPaneNotice: () => {}
    })
    const stream = useRemoteBrowserPageStream({
      activeRuntimeEnvironmentId: 'env-1',
      browserPageId: 'local-page',
      isActive: true,
      lifecycle: harness.lifecycle,
      stagedPage: false,
      runtimeWorktree: 'worktree:wt-1',
      runtimeTarget: () => ({ kind: 'environment', environmentId: 'env-1' }),
      remoteViewportRef: viewport,
      remoteViewportSizeRef: useRef(null),
      remoteCssViewportSizeRef: useRef(null),
      remoteViewportTimerRef: useRef(null),
      streamFrameUrlRef: useRef(null),
      pendingFrameDecodeRef: useRef(0),
      streamBridgeRef: useRef({
        applyTabInfo: () => {},
        clearFrame: () => {},
        handleFrameBytes: () => {},
        closeMissingRemotePage: () => {},
        waitForViewportSize: async () => null,
        syncViewport: async () => {}
      }),
      isActiveRef: useRef(true),
      applyTabInfo: () => {},
      clearStreamFrame: () => {},
      closeMissingRemotePage: () => {},
      clearPendingRemoteWheel,
      setPaneNotice: () => {},
      setPaneBusy: () => {},
      setFrameUrl: () => {},
      setFrameMetadata: () => {}
    })
    useRemoteBrowserPaneCommands({
      page: 'local-page',
      environmentId: 'env-1',
      remotePageId: harness.lifecycle.tokens.remotePage,
      active: true,
      staged: false,
      streamStatus: harness.statusLog.at(-1) ?? { kind: 'stopped', notice: 'unsupported' },
      reconnectGeneration: stream.reconnectGeneration,
      reconnect: stream.reconnectRemoteStream,
      performInput: input.performRemoteInput,
      performNavigation: (command, isCurrent) =>
        navigation.runRemoteNavigation(`browser.${command.navigation}`, command.url, isCurrent)
    })
    return createElement(
      'div',
      { ref: viewport, 'data-testid': 'owner-generation' },
      stream.reconnectGeneration,
      createElement('img', { ref: image, tabIndex: 0, alt: 'remote frame' }),
      createElement('span', { 'data-testid': 'address' }, address),
      createElement(BrowserAddressBar, {
        commandOwner: { page: 'local-page', active: true },
        value: address,
        onChange: setAddress,
        onSubmit: navigation.submitAddressBar,
        onNavigate: navigation.navigateToUrl,
        inputRef: useRef<HTMLInputElement>(null)
      })
    )
  }
  const view = render(createElement(Owner))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(harness.currentStatusKind).toBe('stopped')
  expect(harness.streams).toHaveLength(0)
  harness.setCapabilities(['browser.screencast.v1'])
  const cli = await createRemotePaneCliSocket(runtime)
  const run = cli.run
  try {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    let pending: Promise<void> | undefined
    await act(async () => {
      pending = run('env-1')
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    await pending
    expect(harness.streams).toHaveLength(1)
    expect(view.getByTestId('owner-generation').firstChild?.textContent).toBe('1')
    expect(harness.rpcLog).toContain('status.get')
    expect(harness.rpcLog).toContain('browser.tabCreate')
    expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"reconnectRequested": true'))
    await expect(run('other-environment')).rejects.toThrow('remote_browser_pane_target_mismatch')
    expect(harness.streams).toHaveLength(1)
    await act(async () => {
      harness.streams[0].emitReady()
      view.rerender(createElement(Owner))
    })
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        'local-page': { environmentId: 'env-1', remotePageId: 'page-1' }
      }
    })
    vi.spyOn(view.getByTestId('owner-generation'), 'getBoundingClientRect').mockReturnValue(
      new DOMRect(20, 30, 400, 300)
    )
    await act(async () => {
      await run('env-1', 'click', 'page-1', ['--x', '100', '--y', '75'])
    })
    expect(provider.points).toEqual([expect.objectContaining({ page: 'page-1', x: 200, y: 150 })])
    expect(provider.held).toBe(false)
    expect(document.activeElement).toBe(view.getByAltText('remote frame'))
    expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"inputAccepted": true'))
    await act(async () => {
      await run('env-1', 'key', 'page-1', ['--key', 'r', '--ctrl'])
    })
    expect(provider.keys).toEqual(['Control+r'])
    expect(refresh).toHaveBeenLastCalledWith(expect.anything(), 400)
    await expect(run('env-1', 'click', 'page-1', ['--x', '-1', '--y', '0'])).rejects.toThrow(
      'Invalid remote browser pane command.'
    )
    await expect(run('env-1', 'key', 'page-1', ['--key', 'Unidentified'])).rejects.toThrow(
      'remote_browser_key_unavailable'
    )
    expect(provider.keys).toEqual(['Control+r'])
    await act(async () => {
      await run('env-1', 'navigate', 'page-1', [
        '--navigation',
        'goto',
        '--url',
        'https://next.invalid/'
      ])
    })
    expect(provider.url).toBe('https://next.invalid/')
    expect(useAppStore.getState().browserPagesByWorkspace.workspace[0]).toMatchObject({
      url: provider.url,
      loading: false,
      loadError: null
    })
    expect(view.getByTestId('address').textContent).toContain('next.invalid')
    expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"navigationApplied": true'))
    for (const navigation of ['back', 'forward', 'reload']) {
      await act(async () => {
        await run('env-1', 'navigate', 'page-1', ['--navigation', navigation])
      })
      expect(useAppStore.getState().browserPagesByWorkspace.workspace[0]).toMatchObject({
        loading: false,
        url: navigation === 'back' ? 'https://fixture.invalid' : 'https://next.invalid/'
      })
    }
    provider.failNavigation = true
    await act(async () => {
      await expect(run('env-1', 'navigate', 'page-1', ['--navigation', 'reload'])).rejects.toThrow(
        'fixture navigation failed'
      )
    })
    expect(useAppStore.getState().browserPagesByWorkspace.workspace[0].loadError?.description).toBe(
      'fixture navigation failed'
    )
    let addressRequest: Promise<void> | undefined
    await act(async () => {
      addressRequest = run('env-1', 'address', 'page-1', [
        '--address-action',
        'draft',
        '--text',
        'https://address.invalid/'
      ])
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    await addressRequest
    const addressInput = view.getByRole('combobox')
    if (!(addressInput instanceof HTMLInputElement)) {
      throw new Error('missing actual address bar')
    }
    expect(addressInput.value).toBe('https://address.invalid/')
    expect(document.activeElement).toBe(addressInput)
    provider.failNavigation = false
    await act(async () => {
      addressRequest = run('env-1', 'address', 'page-1', ['--address-action', 'submit'])
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    await addressRequest
    expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"navigationRequested": true'))
    expect(provider.url).toBe('https://address.invalid/')
    expect(useAppStore.getState().browserPagesByWorkspace.workspace[0].url).toBe(provider.url)
    expect(ipcMain.listenerCount('ui:browserViewerResponse')).toBe(0)
    cli.useLegacyPeer()
    await expect(run('env-1', 'status')).rejects.toThrow(
      'This runtime does not support remote browser pane receipts.'
    )
  } finally {
    view.unmount()
    await cli.close()
  }
})
