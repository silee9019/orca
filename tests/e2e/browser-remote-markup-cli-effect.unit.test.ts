// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
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
import { RemoteBrowserPageViewport } from '../../src/renderer/src/components/browser-pane/stream-remote/remote-browser-page-viewport'
import { useRemoteBrowserPaneCommands } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-pane-commands'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { useRemoteBrowserMarkupCapture } from '../../src/renderer/src/components/browser-pane/stream-remote/use-remote-browser-markup-capture'
const fixture = vi.hoisted(() => ({ capture: vi.fn(), compose: vi.fn(), write: vi.fn() }))
vi.mock('../../src/renderer/src/components/browser-pane/annotate/markup-base-image', () => ({
  captureMarkupBaseImage: fixture.capture
}))
vi.mock(
  import('../../src/renderer/src/components/browser-pane/annotate/markup-screenshot-compose'),
  async (original) => ({ ...(await original()), composeMarkupDataUrl: fixture.compose })
)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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
it('runs markup CLI socket through the remote capture and actual viewport editor owner', async () => {
  expect(initial.activeModal).toBe('none')
  fixture.capture.mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
  fixture.compose.mockResolvedValue({
    dataUrl: 'data:image/png;base64,fixture',
    width: 100,
    height: 80
  })
  const provider: { image: string; writes: number; acknowledgment: boolean } = {
    image: '',
    writes: 0,
    acknowledgment: false
  }
  fixture.write.mockImplementation(async (image: string) => {
    provider.image = image
    provider.writes++
    return provider.acknowledgment ? { written: true } : undefined
  })
  Object.defineProperty(globalThis.window, 'api', {
    configurable: true,
    value: { ui: { writeVerifiedClipboardImage: fixture.write } }
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 80)
  )
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
  function Owner() {
    const imageRef = useRef<HTMLImageElement>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const mode = useRemoteBrowserMarkupCapture(imageRef, viewportRef, {
      page: 'local-page',
      active: true,
      environmentId: 'env-1',
      remotePageId: 'page-1'
    })
    useRemoteBrowserPaneCommands({
      page: 'local-page',
      environmentId: 'env-1',
      remotePageId: 'page-1',
      active: true,
      staged: false,
      streamStatus: { kind: 'stopped', notice: 'certificate' },
      reconnectGeneration: 0,
      reconnect: () => {},
      performMarkup: mode.performCommand
    })
    return createElement(RemoteBrowserPageViewport, {
      isActive: true,
      remoteViewportRef: viewportRef,
      imageRef,
      frameUrl: 'frame',
      frameMetadata: null,
      busy: false,
      markup: mode,
      browserTab: page,
      remoteError: null,
      streamStatus: { kind: 'stopped', notice: 'certificate' },
      remoteCertificateTrustSupported: false,
      certificateFailure: {
        challengeId: 'challenge-1',
        browserPageId: 'page-1',
        errorCode: -202,
        error: 'certificate',
        origin: 'https://fixture.invalid',
        displayHost: 'fixture.invalid',
        canProceed: true,
        observedAt: 1
      },
      remotePageHandle: { environmentId: 'env-1', remotePageId: 'page-1' },
      activeRuntimeEnvironmentId: 'env-1',
      worktreeId: 'folder',
      runtimeWorktree: 'folder:fixture',
      runtimeTarget: () => ({ kind: 'environment', environmentId: 'env-1' }),
      onReload: () => {},
      onGoto: () => {},
      onReconnect: () => {},
      handleRemotePointerDown: () => {},
      handleRemotePointerUp: () => {},
      handleRemoteContextMenu: () => {},
      handleRemoteScreenshotKeyDown: () => {}
    })
  }
  const view = render(createElement(Owner))
  const cli = await createRemotePaneCliSocket(runtime)
  try {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = async (action: string, flags: string[]) => {
      let result: Promise<unknown> | undefined
      await act(async () => {
        result = cli.run('env-1', action, 'page-1', flags)
        void result.catch(() => {})
        await new Promise((resolve) => setTimeout(resolve, 30))
      })
      return result
    }
    await expect(
      cli.run('env-other', 'markup', 'page-1', ['--markup-action', 'start'])
    ).rejects.toThrow()
    expect(fixture.capture).not.toHaveBeenCalled()
    await run('markup', ['--markup-action', 'start'])
    expect(fixture.capture).toHaveBeenCalledOnce()
    const image = view.container.querySelector('[data-orca-markup-overlay] img')
    if (!image) {
      throw new Error('missing remote captured image')
    }
    await expect(run('markup-editor', ['--editor-action', 'copy'])).rejects.toThrow(
      'browser_markup_copy_effect_unknown'
    )
    expect(provider.writes).toBe(0)
    fireEvent.load(image)
    await run('markup-editor', ['--editor-action', 'tool', '--value', 'rect'])
    await expect(run('markup-editor', ['--editor-action', 'copy'])).rejects.toThrow(
      'browser_markup_copy_effect_unknown'
    )
    expect(provider.writes).toBe(1)
    expect(view.container.querySelector('[data-orca-markup-overlay]')).not.toBeNull()
    provider.acknowledgment = true
    await run('markup-editor', ['--editor-action', 'copy'])
    expect(provider.image).toBe('data:image/png;base64,fixture')
    expect(provider.writes).toBe(2)
    expect(view.container.querySelector('[data-orca-markup-overlay]')).toBeNull()
    await run('markup', ['--markup-action', 'start'])
    await run('markup', ['--markup-action', 'cancel'])
    expect(view.container.querySelector('[data-orca-markup-overlay]')).toBeNull()
    expect(ipcMain.listenerCount('ui:browserViewerResponse')).toBe(0)
  } finally {
    view.unmount()
    await cli.close()
  }
})
