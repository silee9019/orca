// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { cleanup, render } from '@testing-library/react'
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
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import type { BrowserCertificateProceedResult } from '../../src/shared/browser-workspace-types'
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
it('runs failure CLI socket through real viewport callbacks and reads fake host/clipboard/external state', async () => {
  expect(initial.activeModal).toBe('none')
  const provider: {
    clipboard: string
    external: string[]
    trusted: string[]
    certificate: BrowserCertificateProceedResult
  } = { clipboard: '', external: [], trusted: [], certificate: { ok: true } }
  Object.defineProperty(globalThis.window, 'api', {
    configurable: true,
    value: {
      ui: {
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
  vi.mocked(callRuntimeRpc).mockImplementation(async (target, method, params) => {
    expect(target).toEqual({ kind: 'environment', environmentId: 'env-1' })
    expect(method).toBe('browser.certificate.proceed')
    if (
      typeof params === 'object' &&
      params &&
      'challengeId' in params &&
      typeof params.challengeId === 'string' &&
      provider.certificate.ok
    ) {
      provider.trusted.push(params.challengeId)
    }
    return provider.certificate
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
  function Owner({ capable = true }: { capable?: boolean }) {
    useRemoteBrowserPaneCommands({
      page: 'local-page',
      environmentId: 'env-1',
      remotePageId: 'page-1',
      active: true,
      staged: false,
      streamStatus: { kind: 'stopped', notice: 'certificate' },
      reconnectGeneration: 0,
      reconnect: () => {}
    })
    return createElement(RemoteBrowserPageViewport, {
      isActive: true,
      remoteViewportRef: useRef(null),
      imageRef: useRef(null),
      frameUrl: null,
      frameMetadata: null,
      busy: false,
      markup: {
        state: 'idle',
        isActive: false,
        baseImage: null,
        start: async () => {},
        cancel: () => {},
        complete: async () => {}
      },
      browserTab: page,
      remoteError: null,
      streamStatus: { kind: 'stopped', notice: 'certificate' },
      remoteCertificateTrustSupported: capable,
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
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = (action: string, challenge = 'challenge-1') =>
      cli.run('env-1', 'failure', 'page-1', ['--failure-action', action, '--challenge', challenge])
    await run('copy-address')
    expect(provider.clipboard).toContain('fixture.invalid')
    await run('open-external')
    expect(provider.external).toEqual(['https://fixture.invalid/'])
    await expect(run('certificate-proceed', 'stale')).rejects.toThrow(
      'remote_browser_certificate_challenge_mismatch'
    )
    expect(provider.trusted).toHaveLength(0)
    await run('certificate-proceed')
    expect(provider.trusted).toEqual(['challenge-1'])
    expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"ok": true'))
    provider.certificate = { ok: false, reason: 'expired' }
    await expect(run('certificate-proceed')).rejects.toThrow(
      'Remote certificate proceed refused: expired'
    )
    expect(provider.trusted).toHaveLength(1)
    view.rerender(createElement(Owner, { capable: false }))
    await expect(run('certificate-proceed')).rejects.toThrow(
      'remote_browser_certificate_unsupported'
    )
    expect(provider.trusted).toHaveLength(1)
    expect(ipcMain.listenerCount('ui:browserViewerResponse')).toBe(0)
  } finally {
    view.unmount()
    await cli.close()
  }
})
