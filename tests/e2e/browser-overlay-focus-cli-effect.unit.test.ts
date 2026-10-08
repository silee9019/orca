// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, render } from '@testing-library/react'
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
import type { BrowserViewerRequest } from '../../src/shared/browser-viewer-command'
import { useAppStore } from '../../src/renderer/src/store'
import { seedBrowserOverlayFocusOwner } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-overlay-focus.test-fixture'
import { BROWSER_OVERLAY_FOCUS_COMMAND_SPECS } from '../../src/cli/specs/browser-overlay-focus'
import { BROWSER_OVERLAY_FOCUS_HANDLERS } from '../../src/cli/handlers/browser-overlay-focus'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
vi.mock(
  '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-workspace-pane',
  () => ({ default: () => null })
)
vi.mock(
  '../../src/renderer/src/components/browser-pane/host-guest/browser-automation-visibility',
  () => ({ useBrowserAutomationVisibilityForAny: () => false })
)
vi.mock('../../src/renderer/src/lib/pane-manager/browser-mobile-driver-state', () => ({
  useBrowserMobileDriverForAny: () => false
}))
vi.mock('../../src/renderer/src/lib/pane-manager/browser-remote-viewer-state', () => ({
  useBrowserRemoteViewerForAny: () => false
}))
import BrowserPaneOverlayLayer from '../../src/renderer/src/components/browser-pane/assemble-chrome/BrowserPaneOverlayLayer'
it('focuses through parser/socket/relay and actual mounted overlay owner with store read-back', async () => {
  const initial = useAppStore.getInitialState()
  const previous = Object.getOwnPropertyDescriptor(window, 'api')
  const target = seedBrowserOverlayFocusOwner()
  const runtime = new OrcaRuntimeService()
  const cli = await createRemotePaneCliSocket(runtime)
  const fixtureWindow = new BrowserWindow()
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

  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async () => {
    const specs = BROWSER_OVERLAY_FOCUS_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'owning-group-focus',
        '--viewer',
        'host',
        '--worktree',
        target.worktreeId,
        '--workspace',
        target.workspaceId,
        '--group',
        target.groupId,
        '--execution-host',
        target.executionHostId,
        '--json'
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_OVERLAY_FOCUS_HANDLERS['browser owning-group-focus']({
      ...parsed,
      client: cli.client,
      cwd: 'fixture',
      json: true
    })
  }
  try {
    render(
      createElement(BrowserPaneOverlayLayer, {
        worktreeId: target.worktreeId,
        isWorktreeActive: true
      })
    )
    useAppStore.setState({ activeGroupIdByWorktree: { [target.worktreeId]: 'other' } })
    await act(async () => run())
    expect(useAppStore.getState().activeGroupIdByWorktree[target.worktreeId]).toBe(target.groupId)
    expect(output.mock.lastCall?.[0]).toContain('"focused": true')
    cli.useLegacyPeer()
    await expect(run()).rejects.toThrow('does not support overlay focus')
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
