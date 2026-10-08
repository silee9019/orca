// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { registerBrowserStateIpcBridge } from '../../src/renderer/src/hooks/ipc-events/browser-state-ipc-bridge'
import { registerMobileDriverIpcBridge } from '../../src/renderer/src/hooks/ipc-events/mobile-driver-ipc-bridge'
import { installBrowserObservationApi } from '../../src/renderer/src/runtime/browser-observation-api.test-fixture'
import { hydrateBrowserDrivers } from '../../src/renderer/src/lib/pane-manager/browser-mobile-driver-state'
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
const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0).toReversed()) {
    dispose()
  }
  hydrateBrowserDrivers([])
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('reads actual activation and hydrated driver effects through parser, socket, RPC and bridge subscriptions', async () => {
  installBrowserObservationApi()
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: 'folder:fixture'
  })
  useAppStore
    .getState()
    .createBrowserTab('folder:fixture', 'about:blank', { browserPageId: 'page' })
  registerBrowserStateIpcBridge(disposers, () => false)
  disposers.push(registerMobileDriverIpcBridge(disposers, () => false))
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
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
  const target = ['--page', 'page', '--worktree', 'folder:fixture']
  try {
    await cli.runObservation('visibility', target)
    expect(output.mock.lastCall?.[0]).toContain('"automationVisible": false')
    await cli.runObservation('driver', target)
    expect(output.mock.lastCall?.[0]).toContain('"kind": "idle"')
    const capture = vi.mocked(window.api.browser.onCapturePaintHold).mock.calls[0]?.[0]
    const driver = vi.mocked(window.api.runtime.onBrowserDriverChanged).mock.calls[0]?.[0]
    if (!capture || !driver) {
      throw new Error('actual IPC owner subscriptions missing')
    }
    let accepted = () => {}
    const ready = new Promise<void>((resolve) => {
      accepted = resolve
    })
    const original = vi.mocked(fixtureWindow.webContents.send).getMockImplementation()
    if (!original) {
      throw new Error('relay not installed')
    }
    vi.mocked(fixtureWindow.webContents.send).mockImplementation((...args) => {
      original(...args)
      accepted()
    })
    const pending = cli.runObservation('driver', [...target, '--wait-ms', '5000'])
    await ready
    driver({ browserPageId: 'page', driver: { kind: 'desktop' } })
    await pending
    expect(output.mock.lastCall?.[0]).toContain('"changed": true')
    expect(output.mock.lastCall?.[0]).toContain('"kind": "desktop"')
    capture({ browserPageId: 'page', held: true })
    await cli.runObservation('visibility', target)
    expect(output.mock.lastCall?.[0]).toContain('"automationVisible": true')
    capture({ browserPageId: 'page', held: false })
    await expect(
      cli.runObservation('visibility', [...target, '--wait-ms', '5001'])
    ).rejects.toThrow('5000')
    await expect(
      cli.runObservation('driver', ['--page', 'page', '--worktree', 'wrong'])
    ).rejects.toThrow('target_changed')
    useAppStore
      .getState()
      .setRemoteBrowserPageHandle('page', { environmentId: 'paired', remotePageId: 'remote' })
    await expect(cli.runObservation('visibility', target)).rejects.toThrow('target_changed')
    cli.useLegacyPeer()
    await expect(cli.runObservation('driver', target)).rejects.toThrow(
      'does not support browser observation'
    )
  } finally {
    await cli.close()
  }
})
