// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { useAppStore } from '@/store'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import ClientHostedBrowserTabRows from '../../src/renderer/src/components/tab-bar/ClientHostedBrowserTabRows'
import { TooltipProvider } from '../../src/renderer/src/components/ui/tooltip'
import { installClientHostedPaneApi } from '../../src/renderer/src/components/browser-pane/client-hosted-browser-pane-test-rig'
import { getDefaultSettings } from '../../src/shared/constants'
import {
  applyClientHostedBrowserRows,
  hydrateClientHostedBrowserRows,
  getClientHostedBrowserRowSelection
} from '../../src/renderer/src/lib/pane-manager/client-hosted-browser-row-state'
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
import {
  RuntimeBrowserCommands,
  type RuntimeBrowserCommandHost
} from '../../src/main/runtime/orca-runtime-browser'
import { RuntimeBrowserPageRegistry } from '../../src/main/runtime/runtime-browser-page-registry'
import { BrowserHostLeaseRegistry } from '../../src/main/runtime/browser-host-lease-registry'
vi.mock('../../src/main/browser/browser-cookie-staged-import', async () =>
  (await import('./browser-cookie-staged-import.fixture')).browserCookieStagedImportStub()
)
vi.mock('../../src/main/browser/browser-cookie-import', () => ({
  detectInstalledBrowsers: () => [],
  selectBrowserProfile: () => null,
  importCookiesFromBrowser: vi.fn(),
  importCookiesFromFile: vi.fn(),
  pickCookieFile: vi.fn()
}))
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  hydrateClientHostedBrowserRows([])
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('selects and closes through CLI/socket, actual mounted rows and retained-page service retirement', async () => {
  installClientHostedPaneApi()
  const worktreeId = 'folder:fixture'
  const row = {
    browserPageId: 'page',
    worktreeId,
    url: 'https://example.test',
    title: 'Fixture',
    loading: false,
    browserHostClientId: 'fixture-client',
    hostDeviceName: null,
    hostAbsent: true
  }
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: worktreeId,
    activeModal: 'none',
    groupsByWorktree: {
      [worktreeId]: [{ id: 'group', worktreeId, activeTabId: null, tabOrder: [] }]
    }
  })
  applyClientHostedBrowserRows({ worktreeId, rows: [row] })
  render(
    createElement(
      TooltipProvider,
      null,
      createElement(ClientHostedBrowserTabRows, {
        rows: [row],
        worktreeId,
        groupId: 'group',
        groupActiveTabId: null,
        includeTopTabBorder: true
      })
    )
  )
  const fixtureWindow = new BrowserWindow()
  const pages = new RuntimeBrowserPageRegistry()
  pages.publishClientPage({
    browserPageId: 'page',
    workspaceId: worktreeId,
    browserProfileId: 'default',
    executionHostKey: 'native:fixture:0',
    placement: {
      kind: 'client',
      browserHostClientId: 'fixture-client',
      browserHostGeneration: 1,
      pageHostGeneration: 1
    },
    url: row.url,
    loading: false,
    active: true
  })
  const authority = new BrowserHostLeaseRegistry({ authorityRuntimeId: 'fixture' })
  const retired = vi.fn(() => {
    applyClientHostedBrowserRows({ worktreeId, rows: [] })
  })
  const resolve = async (selector: string) => ({ id: selector.replace(/^id:/, '') })
  const host: RuntimeBrowserCommandHost = {
    getAgentBrowserBridge: () => null,
    resolveWorktreeSelector: resolve,
    resolveBrowserWorkspace: resolve,
    resolveBrowserNetworkExecutionHost: () => ({
      kind: 'native',
      runtimeId: 'fixture',
      revision: 0
    }),
    getBrowserHostLeaseRegistry: () => authority,
    getRuntimeBrowserPageRegistry: () => pages,
    getAuthoritativeWindow: () => fixtureWindow,
    getAvailableAuthoritativeWindow: () => fixtureWindow,
    getOffscreenBrowserBackend: () => null,
    retireRuntimeOwnedBrowserSessionTab: retired
  }
  const commands = new RuntimeBrowserCommands(host)
  const call = vi.fn(async (request: { method: string; params: unknown }) => {
    if (request.method !== 'browser.tabClose') {
      throw new Error('unexpected method')
    }
    const { TabClose } = await import('../../src/shared/rpc-contract/browser-params')
    const result = await commands.browserTabClose(TabClose.parse(request.params))
    return { ok: true, result }
  })
  Reflect.set(window.api, 'runtime', { call })
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
  const target = [
    '--page',
    'page',
    '--worktree',
    worktreeId,
    '--group',
    'group',
    '--host-client',
    'fixture-client',
    '--confirm',
    '--json'
  ]
  try {
    await act(async () => {
      await cli.runClientRow('activate', target)
    })
    expect(getClientHostedBrowserRowSelection()).toMatchObject({
      browserPageId: 'page',
      groupId: 'group'
    })
    expect(call).not.toHaveBeenCalled()
    await act(async () => {
      await cli.runClientRow('close', target)
    })
    expect(call).toHaveBeenCalledExactlyOnceWith({
      method: 'browser.tabClose',
      params: { worktree: 'id:folder:fixture', page: 'page' }
    })
    expect(pages.getPage('page')).toBeUndefined()
    expect(retired).toHaveBeenCalledExactlyOnceWith(worktreeId, 'page')
    expect(output.mock.lastCall?.[0]).toContain('"applied": true')
    cli.useLegacyPeer()
    await expect(cli.runClientRow('activate', target)).rejects.toThrow(
      'does not support hosted-row'
    )
  } finally {
    await cli.close()
  }
})
