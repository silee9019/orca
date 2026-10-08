// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
import { BROWSER_BANNER_COMMAND_SPECS } from '../../src/cli/specs/browser-banner'
import { BROWSER_BANNER_HANDLERS } from '../../src/cli/handlers/browser-banner'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
vi.mock(
  '../../src/renderer/src/components/browser-pane/annotate/BrowserAnnotationSendMenuContent',
  () => ({ BrowserAnnotationSendMenuContent: () => null })
)
import { BrowserBannerFixture } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-banner.test-fixture'
it('performs banner effects through parser/socket/relay and real mounted state owners', async () => {
  const initial = useAppStore.getInitialState()
  const previous = Object.getOwnPropertyDescriptor(window, 'api')
  seedBrowserOverlayFocusOwner()
  Reflect.set(
    window.api.browser,
    'onPermissionDenied',
    vi.fn(() => () => {})
  )
  Reflect.set(
    window.api.browser,
    'onPopup',
    vi.fn(() => () => {})
  )
  Reflect.set(
    window.api.browser,
    'setGrabMode',
    vi.fn(async () => ({ ok: true }))
  )
  Reflect.set(
    window.api.browser,
    'cancelGrab',
    vi.fn(async () => true)
  )
  Reflect.set(
    window.api.browser,
    'awaitGrabSelection',
    vi.fn(() => new Promise<never>(() => {}))
  )
  const runtime = new OrcaRuntimeService()
  const cli = await createRemotePaneCliSocket(runtime)
  const fixtureWindow = new BrowserWindow()
  runtime.setNotifier({
    browserViewer: (command) => requestBrowserViewerFromRenderer(fixtureWindow, command)
  })
  vi.mocked(fixtureWindow.webContents.send).mockImplementation(
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
  const run = async (
    action: 'resource-dismiss' | 'cancel-grab' | 'send-menu-open' | 'send-menu-close'
  ) => {
    const specs = BROWSER_BANNER_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'banner',
        action,
        '--viewer',
        'host',
        '--page',
        'page',
        '--worktree',
        'folder:fixture',
        '--json'
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_BANNER_HANDLERS[`browser banner ${action}`]({
      ...parsed,
      client: cli.client,
      cwd: 'fixture',
      json: true
    })
  }
  try {
    render(createElement(BrowserBannerFixture))
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Seed notice' })))
    await run('resource-dismiss')
    expect(screen.queryByText('FIXTURE_PRIVATE')).toBeNull()
    expect(output.mock.lastCall?.[0]).not.toContain('FIXTURE_PRIVATE')
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Start annotation grab' }))
    )
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Seed annotation' })))
    await run('send-menu-open')
    expect(useAppStore.getState().agentSendPopoverTargetMode?.id).toBe(
      'browser-annotations:page:banner'
    )
    await run('send-menu-close')
    expect(useAppStore.getState().agentSendPopoverTargetMode).toBeNull()
    await run('cancel-grab')
    expect(output.mock.lastCall?.[0]).toContain('"cancellationAccepted": true')
    expect(window.api.browser.cancelGrab).toHaveBeenCalledWith({ browserPageId: 'page' })
    cli.useLegacyPeer()
    await expect(run('resource-dismiss')).rejects.toThrow('does not support mounted browser banner')
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
