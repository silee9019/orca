// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
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
import { requestBrowserViewerFromRenderer } from '../../src/main/window/browser-viewer-request-relay'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import type {
  BrowserViewerResult,
  BrowserViewerRequest
} from '../../src/shared/browser-viewer-command'
import { useAppStore } from '../../src/renderer/src/store'
import { seedBrowserOverlayFocusOwner } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-overlay-focus.test-fixture'
import { BROWSER_EGRESS_COMMAND_SPECS } from '../../src/cli/specs/browser-egress'
import { BROWSER_EGRESS_HANDLERS } from '../../src/cli/handlers/browser-egress'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { RemoteRuntimeEgressIndicator } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-egress-indicator'
import { TooltipProvider } from '../../src/renderer/src/components/ui/tooltip'
it('performs egress effects through parser/socket/relay and real mounted state owners', async () => {
  const initial = useAppStore.getInitialState()
  const previous = Object.getOwnPropertyDescriptor(window, 'api')
  seedBrowserOverlayFocusOwner()
  useAppStore.setState({
    remoteBrowserPageHandlesByPageId: {
      page: { environmentId: 'env', remotePageId: 'remote', placement: { kind: 'server' } }
    }
  })
  const runtime = new OrcaRuntimeService()
  const cli = await createRemotePaneCliSocket(runtime)
  const fixtureWindow = new BrowserWindow()
  runtime.setNotifier({
    browserViewer: (command) => requestBrowserViewerFromRenderer(fixtureWindow, command)
  })
  vi.spyOn(fixtureWindow.webContents, 'send').mockImplementation(
    (_channel, request: BrowserViewerRequest) => {
      let applied: Promise<BrowserViewerResult> | undefined
      void Promise.resolve(
        act(async () => {
          applied = applyBrowserViewerRequest(request)
          void applied.catch(() => {})
        })
      )
        .then(() => {
          if (!applied) {
            throw new Error('missing renderer request')
          }
          return applied
        })
        .then(
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

  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async (action: 'open' | 'close' | 'settings' | 'status') => {
    const specs = BROWSER_EGRESS_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'egress',
        action,
        '--viewer',
        'host',
        '--page',
        'page',
        '--worktree',
        'folder:fixture',
        '--placement',
        'streamed',
        '--runtime-environment',
        'env',
        '--remote-page',
        'remote',
        '--json'
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_EGRESS_HANDLERS[`browser egress ${action}`]({
      ...parsed,
      client: cli.client,
      cwd: 'fixture',
      json: true
    })
  }
  try {
    render(
      createElement(
        TooltipProvider,
        {},
        createElement(RemoteRuntimeEgressIndicator, {
          runtimeEnvironmentId: 'env',
          presentation: 'streamed',
          commandOwner: { page: 'page', isActive: true }
        })
      )
    )
    await run('open')
    expect(screen.getByTestId('ssh-egress-indicator-settings')).not.toBeNull()
    expect(output.mock.lastCall?.[0]).toContain('"open": true')
    await run('close')
    expect(screen.queryByTestId('ssh-egress-indicator-settings')).toBeNull()
    await run('status')
    expect(output.mock.lastCall?.[0]).toContain('"open": false')
    await run('settings')
    expect(useAppStore.getState().activeView).toBe('settings')
    expect(useAppStore.getState().settingsNavigationTarget?.sectionId).toBe(
      'browser-client-hosted-remote'
    )
    cli.useLegacyPeer()
    await expect(run('open')).rejects.toThrow('does not support mounted browser egress')
  } finally {
    cleanup()
    await cli.close()
    vi.restoreAllMocks()
    useAppStore.setState(initial, true)
    if (previous) {
      Object.defineProperty(window, 'api', previous)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
