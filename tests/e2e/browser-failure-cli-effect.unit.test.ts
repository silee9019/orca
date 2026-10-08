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
it.each(['local', 'client-hosted'] as const)(
  'uses CLI socket and the actual %s owner callbacks with read-back acceptance',
  async (placement) => {
    const url = 'https://localhost:3443/'
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
    const provider: { clipboard: string; external: string[]; approved: string[]; notice: string } =
      {
        clipboard: '',
        external: [],
        approved: [],
        notice: ''
      }
    let failClipboard = true
    installClientHostedPaneApi({
      ui: {
        writeClipboardText: async (value: string) => {
          if (failClipboard) {
            throw new Error('clipboard_provider_failed')
          }
          provider.clipboard = value
        }
      },
      shell: {
        openVerifiedUrl: async (value: string) => {
          provider.external.push(value)
          return { opened: true }
        },
        openUrl: async () => {
          throw new Error('legacy external must not run')
        }
      },
      browser: {
        proceedCertificate: async ({
          browserPageId,
          challengeId
        }: {
          browserPageId: string
          challengeId: string
        }) => {
          expect(browserPageId).toBe('page')
          provider.approved.push(challengeId)
          return { ok: true }
        }
      }
    })
    useAppStore.setState({
      settings: getDefaultSettings('/fixture'),
      activeWorktreeId: 'folder:fixture',
      persistedUIReady: true
    })
    useAppStore.getState().createBrowserTab('folder:fixture', url, {
      browserPageId: 'page',
      browserRuntimeEnvironmentId: placement === 'client-hosted' ? 'environment' : null
    })
    if (placement === 'client-hosted') {
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
    }
    useAppStore.getState().updateBrowserPageState('page', {
      loadError: { code: -202, description: 'ERR_CERT_AUTHORITY_INVALID', validatedUrl: url }
    })
    useAppStore.getState().setBrowserPageCertificateFailure('page', {
      browserPageId: 'page',
      challengeId: 'challenge',
      errorCode: -202,
      error: 'ERR_CERT_AUTHORITY_INVALID',
      origin: 'https://localhost:3443',
      displayHost: 'localhost:3443',
      canProceed: true,
      observedAt: 0
    })
    render(
      createElement(BrowserFailureFixtureOwner, {
        placement,
        notice: (value) => {
          if (typeof value === 'string') {
            provider.notice = value
          }
        }
      })
    )
    expect(screen.getByRole('button', { name: 'Copy Address' })).not.toBeNull()
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
    const run = (action: string, extra: string[] = []) =>
      cli.runFailure([
        '--page',
        'page',
        '--worktree',
        'folder:fixture',
        '--placement',
        placement,
        ...(placement === 'client-hosted'
          ? [
              '--runtime-environment',
              'environment',
              '--remote-page',
              'remote-page',
              '--browser-host-client',
              'fixture',
              '--browser-host-generation',
              '3',
              '--page-host-generation',
              '7'
            ]
          : []),
        '--url',
        url,
        '--error-code=-202',
        '--action',
        action,
        ...(action === 'certificate-proceed' ? ['--confirm'] : []),
        ...extra
      ])
    if (placement === 'client-hosted') {
      const clipboard = vi.spyOn(window.api.ui, 'writeClipboardText')
      for (const extra of [
        ['--remote-page', 'wrong'],
        ['--browser-host-client', 'wrong'],
        ['--browser-host-generation', '4'],
        ['--page-host-generation', '8']
      ]) {
        await expect(run('copy-address', extra)).rejects.toThrow('owner_changed')
      }
      expect(clipboard).not.toHaveBeenCalled()
    }
    try {
      await act(async () => {
        await expect(run('copy-address')).rejects.toThrow('clipboard_provider_failed')
      })
      expect(provider.clipboard).toBe('')
      expect(provider.notice).toBe('')
      failClipboard = false
      await act(async () => {
        await run('copy-address')
      })
      expect(provider.clipboard).toBe(url)
      if (placement === 'local') {
        expect(provider.notice).toContain('Copied')
      }
      if (placement === 'client-hosted') {
        const original = useAppStore.getState().remoteBrowserPageHandlesByPageId['page']
        const clipboard = vi.spyOn(window.api.ui, 'writeClipboardText')
        clipboard.mockClear()
        const connecting = [
          {
            environmentId: 'environment',
            remotePageId: 'remote-page',
            staged: true as const,
            stagedClientHosted: true as const
          },
          {
            environmentId: 'environment',
            remotePageId: 'remote-page',
            restoredFromSession: true as const,
            restoredClientHosted: true as const
          },
          { environmentId: 'environment', remotePageId: 'remote-page' },
          {
            environmentId: 'environment',
            remotePageId: 'remote-page',
            placement: { kind: 'server' as const }
          }
        ]
        for (const handle of connecting) {
          act(() => useAppStore.getState().setRemoteBrowserPageHandle('page', handle))
          await expect(run('copy-address')).rejects.toThrow()
        }
        expect(clipboard).not.toHaveBeenCalled()
        act(() => useAppStore.getState().setRemoteBrowserPageHandle('page', original))
        expect(screen.getByRole('button', { name: 'Copy Address' })).not.toBeNull()
        let signalStarted = () => {}
        const started = new Promise<void>((resolve) => {
          signalStarted = resolve
        })
        let finish = () => {}
        clipboard.mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve
              signalStarted()
            })
        )
        const pending = run('copy-address')
        const rejected = expect(pending).rejects.toThrow('effect_unknown')
        await started
        act(() =>
          useAppStore.getState().setRemoteBrowserPageHandle('page', {
            ...original,
            placement: {
              kind: 'client',
              browserHostClientId: 'fixture',
              browserHostGeneration: 3,
              pageHostGeneration: 8
            }
          })
        )
        await act(async () => {
          finish()
          await rejected
        })
        act(() => useAppStore.getState().setRemoteBrowserPageHandle('page', original))
      }
      const verifiedExternal = window.api.shell.openVerifiedUrl
      Reflect.deleteProperty(window.api.shell, 'openVerifiedUrl')
      await expect(run('open-external')).rejects.toThrow('external_open_unavailable')
      expect(provider.external).toEqual([])
      Object.defineProperty(window.api.shell, 'openVerifiedUrl', {
        configurable: true,
        value: verifiedExternal
      })
      await act(async () => {
        await run('open-external')
      })
      expect(provider.external).toEqual([url])
      await expect(run('certificate-proceed', ['--challenge', 'stale'])).rejects.toThrow(
        'challenge_mismatch'
      )
      expect(provider.approved).toEqual([])
      await act(async () => {
        await run('certificate-proceed', ['--challenge', 'challenge'])
      })
      expect(provider.approved).toEqual(['challenge'])
      expect(screen.getByRole('button', { name: 'Copy Address' }).hasAttribute('disabled')).toBe(
        true
      )
      expect(output.mock.lastCall?.[0]).toContain('"accepted": true')
      cli.useLegacyPeer()
      await expect(run('copy-address')).rejects.toThrow('does not support Failure')
    } finally {
      await cli.close()
    }
  }
)
