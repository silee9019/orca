// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserFailureFixtureOwner } from '../../src/renderer/src/components/browser-pane/navigate/browser-failure-owner.test-fixture'
import { installClientHostedPaneApi } from '../../src/renderer/src/components/browser-pane/client-hosted-browser-pane-test-rig'
vi.mock(
  '../../src/renderer/src/components/browser-pane/stream-remote/remote-browser-page-pane',
  () => ({
    RemoteBrowserPagePane: () => createElement('div', { 'data-testid': 'server-browser-pane' })
  })
)
const guest = vi.hoisted(() => ({ attach: vi.fn() }))
vi.mock(
  '../../src/renderer/src/components/browser-pane/browser-client-page-renderer-installation',
  () => ({ attachBrowserClientPageToViewport: guest.attach })
)
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 74
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
it.each(['retry', 'try-https'] as const)(
  'uses the materialized client parent and socket for %s recovery',
  async (action) => {
    const url = 'http://localhost:3443/'
    const webview = Object.assign(document.createElement('webview'), {
      getURL: vi.fn(() => url),
      getTitle: vi.fn(() => 'Fixture'),
      isLoading: vi.fn(() => false),
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      getWebContentsId: vi.fn(() => 42),
      getZoomLevel: vi.fn(() => 0),
      setZoomLevel: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      reloadIgnoringCache: vi.fn(),
      stop: vi.fn(),
      findInPage: vi.fn(),
      stopFindInPage: vi.fn(),
      loadURL: vi.fn(async () => {}),
      executeJavaScript: vi.fn(async () => undefined),
      send: vi.fn()
    })
    guest.attach.mockReturnValue({ webview, detach: vi.fn(), nextMetadataRevision: vi.fn(() => 1) })
    installClientHostedPaneApi()
    useAppStore.setState({
      settings: getDefaultSettings('/fixture'),
      activeWorktreeId: 'folder:fixture',
      persistedUIReady: true
    })
    useAppStore.getState().createBrowserTab('folder:fixture', url, {
      browserPageId: 'page',
      browserRuntimeEnvironmentId: 'environment'
    })
    useAppStore.getState().setRemoteBrowserPageHandle('page', {
      environmentId: 'environment',
      remotePageId: 'remote-page',
      placement: {
        kind: 'client',
        browserHostClientId: 'fixture',
        browserHostGeneration: 3,
        pageHostGeneration: 7
      }
    })
    useAppStore.getState().updateBrowserPageState('page', {
      loading: false,
      loadError: { code: -102, description: 'ERR_CONNECTION_REFUSED', validatedUrl: url }
    })
    render(
      createElement(BrowserFailureFixtureOwner, { placement: 'client-hosted', notice: () => {} })
    )
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2)
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
    const run = () =>
      cli.runFailure([
        '--page',
        'page',
        '--worktree',
        'folder:fixture',
        '--placement',
        'client-hosted',
        '--runtime-environment',
        'environment',
        '--remote-page',
        'remote-page',
        '--browser-host-client',
        'fixture',
        '--browser-host-generation',
        '3',
        '--page-host-generation',
        '7',
        '--url',
        url,
        '--error-code=-102',
        '--action',
        action
      ])
    const page = () =>
      Object.values(useAppStore.getState().browserPagesByWorkspace)
        .flat()
        .find((entry) => entry.id === 'page')
    try {
      expect(page()?.loading).toBe(false)
      await act(async () => {
        try {
          await run()
        } catch (error) {
          if (action === 'try-https') {
            expect(webview.loadURL).toHaveBeenCalledExactlyOnceWith('https://localhost:3443/')
            expect(page()).toMatchObject({ loading: true, loadError: null, url })
          }
          throw error
        }
      })
      const target = action === 'retry' ? url : 'https://localhost:3443/'
      expect(page()).toMatchObject({
        url: action === 'retry' ? target : url,
        loading: true,
        title: target
      })
      if (action === 'retry') {
        expect(Reflect.get(webview, 'src')).toBe(target)
      } else {
        expect(webview.loadURL).toHaveBeenCalledExactlyOnceWith(target)
      }
      expect(output.mock.lastCall?.[0]).toContain('"accepted": true')
      expect(output.mock.lastCall?.[0]).toContain(`"action": "${action}"`)
      expect(useAppStore.getState().remoteBrowserPageHandlesByPageId['page']).toMatchObject({
        environmentId: 'environment',
        remotePageId: 'remote-page',
        placement: {
          browserHostClientId: 'fixture',
          browserHostGeneration: 3,
          pageHostGeneration: 7
        }
      })
      if (action === 'retry') {
        expect(page()?.title).toBe(url)
        await expect(run()).rejects.toThrow('retry_already_loading')
      } else {
        expect(page()?.loadError).toBeNull()
        expect(screen.queryByRole('button', { name: 'Copy Address' })).toBeNull()
        await expect(run()).rejects.toThrow()
      }
      if (action === 'retry') {
        expect(Reflect.get(webview, 'src')).toBe(target)
      } else {
        expect(webview.loadURL).toHaveBeenCalledExactlyOnceWith(target)
      }
    } finally {
      await cli.close()
    }
  }
)
