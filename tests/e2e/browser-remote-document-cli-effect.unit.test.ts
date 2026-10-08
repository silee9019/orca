// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock(import('@/runtime/runtime-rpc-client'), async (original) => ({
  ...(await original()),
  callRuntimeRpc: vi.fn(async () => ({ ok: true }))
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
import { useRemoteBrowserPaneCommands } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-pane-commands'
import { openRemoteBrowserWorkspaceDocument } from '../../src/renderer/src/components/browser-pane/stream-remote/open-remote-browser-workspace-document'
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
it.each(['converted', 'activated-existing'] as const)(
  'opens a workspace document (%s) through CLI/socket and reads back after stream owner unmount',
  async (outcome) => {
    expect(initial.activeModal).toBe('none')
    const retired: string[] = []
    vi.mocked(callRuntimeRpc).mockImplementation(async (target, method, params) => {
      expect(target).toEqual({ kind: 'environment', environmentId: 'env-1' })
      expect(method).toBe('browser.tabClose')
      expect(params).toMatchObject({ page: 'page-1' })
      retired.push('page-1')
      return { closed: true }
    })
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
    const page = {
      id: 'local-page',
      workspaceId: 'workspace',
      worktreeId: 'folder:fixture',
      url: 'https://fixture.invalid/',
      title: 'Fixture',
      loading: false,
      faviconUrl: null,
      canGoBack: false,
      canGoForward: false,
      createdAt: 1,
      loadError: {
        code: -202,
        description: 'certificate',
        validatedUrl: 'https://fixture.invalid/'
      }
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
    useAppStore.setState({
      folderWorkspaces: [
        {
          id: 'fixture',
          projectGroupId: 'project',
          name: 'Fixture',
          folderPath: '/fixture',
          executionHostId: 'runtime:env-1',
          linkedTask: null,
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 1,
          createdAt: 1,
          updatedAt: 1
        }
      ],
      activeWorktreeId: 'folder:fixture',
      activeWorkspaceExecutionHostId: 'runtime:env-1'
    })
    const initialPage = useAppStore.getState().browserPagesByWorkspace.workspace[0]
    useAppStore.setState({
      browserTabsByWorktree: {
        'folder:fixture': [
          {
            ...initialPage,
            id: 'workspace',
            activePageId: initialPage.id,
            pageIds: [initialPage.id]
          }
        ]
      }
    })

    if (outcome === 'activated-existing') {
      const state = useAppStore.getState()
      const source = state.browserPagesByWorkspace.workspace[0]
      useAppStore.setState({
        browserPagesByWorkspace: {
          workspace: [
            source,
            {
              ...source,
              id: 'existing-doc',
              docLocation: { worktreeId: 'folder:fixture', filePath: '/fixture/report.html' },
              browserRuntimeEnvironmentId: null
            }
          ]
        },
        browserTabsByWorktree: {
          'folder:fixture': state.browserTabsByWorktree['folder:fixture'].map((workspace) => ({
            ...workspace,
            pageIds: ['local-page', 'existing-doc']
          }))
        }
      })
    }
    let streamUnmounted = false
    function StreamOwner() {
      useRemoteBrowserPaneCommands({
        page: 'local-page',
        environmentId: 'env-1',
        remotePageId: 'page-1',
        active: true,
        staged: false,
        streamStatus: { kind: 'live' },
        reconnectGeneration: 0,
        reconnect: () => {},
        performDocument: (command) =>
          openRemoteBrowserWorkspaceDocument('local-page', 'env-1', command.document)
      })
      return createElement('div', { 'data-testid': 'stream-owner' })
    }
    function Owner() {
      const page = useAppStore((state) => {
        const active = state.browserTabsByWorktree['folder:fixture'][0].activePageId
        return (
          state.browserPagesByWorkspace.workspace.find((page) => page.id === active) ??
          state.browserPagesByWorkspace.workspace[0]
        )
      })
      if (page.docLocation) {
        streamUnmounted = true
        return createElement('div', { 'data-testid': 'document-owner' }, page.docLocation.filePath)
      }
      return createElement(StreamOwner)
    }
    const view = render(createElement(Owner))
    const cli = await createRemotePaneCliSocket(runtime)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await act(async () => {
        await expect(
          cli.run('env-1', 'document', 'page-1', [
            '--document-workspace',
            'folder:missing',
            '--file',
            '/fixture/report.html'
          ])
        ).rejects.toThrow('remote_browser_document_owner_mismatch')
      })
      expect(retired).toEqual([])
      expect(view.queryByTestId('stream-owner')).not.toBeNull()
      await act(async () => {
        await cli.run('env-1', 'document', 'page-1', [
          '--document-workspace',
          'folder:fixture',
          '--file',
          '/fixture/report.html'
        ])
      })
      expect(streamUnmounted).toBe(true)
      expect(view.queryByTestId('stream-owner')).toBeNull()
      expect(view.getByTestId('document-owner').textContent).toBe('/fixture/report.html')
      expect(
        useAppStore.getState().browserPagesByWorkspace.workspace.find((page) => page.docLocation)
          ?.docLocation
      ).toMatchObject({
        worktreeId: 'folder:fixture',
        filePath: '/fixture/report.html'
      })
      if (outcome === 'converted') {
        expect(
          useAppStore.getState().remoteBrowserPageHandlesByPageId['local-page']
        ).toBeUndefined()
      } else {
        expect(useAppStore.getState().remoteBrowserPageHandlesByPageId['local-page']).toMatchObject(
          { remotePageId: 'page-1' }
        )
      }
      expect(retired).toEqual(outcome === 'converted' ? ['page-1'] : [])
      expect(output).toHaveBeenLastCalledWith(
        expect.stringContaining(`"remoteRetirementRequested": ${outcome === 'converted'}`)
      )
      cli.useLegacyPeer()
      await expect(
        cli.run('env-1', 'document', 'page-1', [
          '--document-workspace',
          'folder:fixture',
          '--file',
          '/fixture/report.html'
        ])
      ).rejects.toMatchObject({ code: 'incompatible_runtime' })
      expect(retired).toEqual(outcome === 'converted' ? ['page-1'] : [])
    } finally {
      await cli.close()
    }
  }
)
