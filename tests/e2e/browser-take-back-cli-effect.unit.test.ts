// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { useAppStore } from '@/store'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import BrowserPane from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-workspace-pane'
import { seedBrowserTakeBackOwner } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-take-back-owner.test-fixture'
import { RuntimeBrowserDriverController } from '../../src/main/runtime/runtime-browser-driver-controller'
import {
  setDriverForBrowserPage,
  hydrateBrowserDrivers
} from '../../src/renderer/src/lib/pane-manager/browser-mobile-driver-state'
vi.mock('../../src/renderer/src/components/browser-pane/assemble-chrome/browser-page-pane', () => ({
  BrowserPagePane: () => createElement('div', { 'data-testid': 'native-page-content' })
}))
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
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  hydrateBrowserDrivers([])
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('takes back through parser/socket, the actual BrowserPane overlay callback and existing driver controller', async () => {
  seedBrowserTakeBackOwner()
  const cancel = vi.fn()
  const controller = new RuntimeBrowserDriverController({
    notifyChanged: (page, driver) => setDriverForBrowserPage(page, driver),
    cancelScreencast: cancel
  })
  controller.set('page', { kind: 'mobile', clientId: 'fixture-phone' })
  const provider = vi.fn(async (page: string) => ({
    reclaimed: controller.reclaimForDesktop(page)
  }))
  Reflect.set(window.api, 'runtime', { reclaimBrowserForDesktop: provider })
  const workspace = useAppStore.getState().browserTabsByWorktree['folder:fixture']?.[0]
  if (!workspace) {
    throw new Error('missing real workspace')
  }
  render(createElement(BrowserPane, { browserTab: workspace, isActive: true }))
  expect(screen.getByRole('button', { name: 'Take back' })).not.toBeNull()
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
  const target = [
    '--page',
    'page',
    '--worktree',
    'folder:fixture',
    '--mobile-client',
    'fixture-phone',
    '--confirm'
  ]
  try {
    await expect(cli.runTakeBack(target.filter((value) => value !== '--confirm'))).rejects.toThrow(
      '--confirm'
    )
    await expect(cli.runTakeBack([...target, '--mobile-client', 'wrong'])).rejects.toThrow(
      'driver_changed'
    )
    expect(provider).not.toHaveBeenCalled()
    provider.mockResolvedValueOnce({ reclaimed: false })
    await act(async () => {
      await expect(cli.runTakeBack(target)).rejects.toThrow('Could not reclaim browser control')
    })
    expect(controller.get('page')).toEqual({ kind: 'mobile', clientId: 'fixture-phone' })
    expect(cancel).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain("Couldn't take back")
    await act(async () => {
      await cli.runTakeBack(target)
    })
    expect(provider).toHaveBeenNthCalledWith(1, 'page')
    expect(provider).toHaveBeenNthCalledWith(2, 'page')
    expect(controller.get('page')).toEqual({ kind: 'desktop' })
    expect(cancel).toHaveBeenCalledExactlyOnceWith('page')
    expect(screen.queryByRole('button', { name: 'Take back' })).toBeNull()
    expect(output.mock.lastCall?.[0]).toContain('"reclaimed": true')
    expect(output.mock.lastCall?.[0]).toContain('"driver": "desktop"')
    await expect(cli.runTakeBack(target)).rejects.toThrow('owner_unavailable')
    expect(provider).toHaveBeenCalledTimes(2)
    cli.useLegacyPeer()
    await expect(cli.runTakeBack(target)).rejects.toThrow('does not support browser take-back')
  } finally {
    await cli.close()
  }
})
