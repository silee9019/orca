// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, useRef, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { once } from 'node:events'
vi.mock('../../src/renderer/src/components/emulator-pane/emulator-screen-stream-content', () => ({
  EmulatorScreenStreamContent: () => null
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
import { RuntimeEmulatorCommands } from '../../src/main/runtime/orca-runtime-emulator'
import { EmulatorBridge } from '../../src/main/emulator/emulator-bridge'
import { useEmulatorPaneSession } from '../../src/renderer/src/components/emulator-pane/use-emulator-pane-session'
import { useEmulatorSessionCommands } from '../../src/renderer/src/components/emulator-pane/use-emulator-session-commands'
import { EmulatorDeviceFrame } from '../../src/renderer/src/components/emulator-pane/emulator-device-frame'
import { applyEmulatorFrame } from '../../src/renderer/src/runtime/emulator-frame-bridge'
import { createEmulatorViewerCliSocket } from './emulator-viewer-cli-socket.test-fixture'
import type { EmulatorFocusRequest } from '../../src/shared/emulator-focus'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import { cancelPendingSimulatorPaneShutdown } from '@/lib/simulator-pane-shutdown-scheduler'

it('runs parser/socket/dispatcher/service/real pane owner/backend/read-back with old-peer and host fences', async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  const initial = useAppStore.getState()
  const api = Object.getOwnPropertyDescriptor(window, 'api')
  const viewer = new BrowserWindow()
  const controlServer = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await once(controlServer, 'listening')
  const address = controlServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Missing control socket')
  }
  const frames: unknown[] = []
  controlServer.on('connection', (client) =>
    client.on('message', (data) => {
      const bytes = Buffer.concat(
        Array.isArray(data) ? data : [data instanceof ArrayBuffer ? Buffer.from(data) : data]
      )
      expect(bytes[0]).toBe(3)
      frames.push(JSON.parse(bytes.subarray(1).toString()))
    })
  )
  vi.stubGlobal('WebSocket', WebSocket)
  const bridge = new EmulatorBridge()
  let booted = false
  let starts = 0
  let stops = 0
  for (const backend of bridge.listBackends()) {
    vi.spyOn(backend, 'isSupportedOnHost').mockReturnValue(backend.kind === 'android')
    vi.spyOn(backend, 'ownsDevice').mockResolvedValue(backend.kind === 'android')
    vi.spyOn(backend, 'resolveDeviceId').mockResolvedValue('device-a')
    vi.spyOn(backend, 'listDevices').mockImplementation(async () => [
      {
        backend: 'android',
        id: 'device-a',
        name: 'Phone A',
        state: booted ? 'booted' : 'shutdown',
        isAvailable: true
      }
    ])
    vi.spyOn(backend, 'startSession').mockImplementation(async () => {
      starts += 1
      booted = true
      return {
        deviceUdid: 'device-a',
        streamUrl: 'http://fixture/stream',
        wsUrl: `ws://127.0.0.1:${address.port}`,
        backend: 'android'
      }
    })
    vi.spyOn(backend, 'stopHelperForDevice').mockResolvedValue()
    vi.spyOn(backend, 'shutdownDevice').mockImplementation(async () => {
      stops += 1
      booted = false
    })
  }
  const commands = new RuntimeEmulatorCommands({
    getEmulatorBridge: () => bridge,
    resolveEmulatorWorkspaceId: async (id) => {
      if (id !== 'folder:session') {
        throw new Error('selector_not_found')
      }
      return id
    },
    resolveEmulatorCleanupWorkspaceId: async (id) => id,
    getAuthoritativeWindow: () => viewer,
    getSettings: () => ({
      androidSdkPath: null,
      mobileEmulatorEnabled: true,
      mobileEmulatorDefaultDeviceUdid: null
    })
  })
  const runtime = new OrcaRuntimeService()
  runtime.emulatorFrame = commands.emulatorFrame.bind(commands)
  runtime.emulatorAttach = commands.emulatorAttach.bind(commands)
  runtime.emulatorShutdown = commands.emulatorShutdown.bind(commands)
  runtime.emulatorListDevices = commands.emulatorListDevices.bind(commands)
  const socket = await createEmulatorViewerCliSocket(runtime)
  vi.mocked(viewer.webContents.send).mockImplementation(
    (channel, request: EmulatorFocusRequest) => {
      if (channel !== 'emulator:frameRequest') {
        return
      }
      void applyEmulatorFrame(request).then(
        (result) =>
          ipcMain.emit(
            'emulator:focusResponse',
            { sender: viewer.webContents },
            { id: request.id, ok: true, result }
          ),
        () =>
          ipcMain.emit(
            'emulator:focusResponse',
            { sender: viewer.webContents },
            { id: request.id, ok: false, error: 'not_applied' }
          )
      )
    }
  )
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      runtime: {
        call: ({ method, params }: { method: string; params: unknown }) =>
          socket.client.call(method, params)
      }
    }
  })
  const settings = getDefaultSettings('/fixture/home')
  useAppStore.setState({
    persistedUIReady: true,
    settings,
    activeWorktreeId: 'folder:session',
    groupsByWorktree: {
      'folder:session': [
        { id: 'group', worktreeId: 'folder:session', activeTabId: 'sim', tabOrder: ['sim'] }
      ]
    },
    unifiedTabsByWorktree: {
      'folder:session': [
        {
          id: 'sim',
          entityId: 'sim',
          worktreeId: 'folder:session',
          groupId: 'group',
          contentType: 'simulator',
          executionHostId: 'local',
          label: 'Mobile Emulator',
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 0
        }
      ]
    }
  })
  function Owner() {
    const paneRef = useRef<HTMLDivElement>(null)
    const session = useEmulatorPaneSession({
      worktreeId: 'folder:session',
      tabId: 'sim',
      autoAttachOnMount: false
    })
    useEmulatorSessionCommands(paneRef, session)
    return createElement(
      'div',
      { 'data-emulator-tab-id': 'sim' },
      createElement(
        'div',
        { ref: paneRef, 'data-emulator-pane': true },
        createElement(
          'span',
          { 'data-session-readback': true },
          `${session.selectedUdid}:${session.isLive}:${session.error}`
        ),
        createElement(EmulatorDeviceFrame, {
          isActive: true,
          isLive: session.isLive,
          loading: session.loading,
          visualOrientation: session.visualOrientation,
          wsUrl: session.wsUrl,
          onTap: () => {},
          onGesture: () => {}
        })
      )
    )
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 200)
  )
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const args = [
    'session-view',
    '--worktree',
    'folder:session',
    '--tab-id',
    'sim',
    '--device',
    'device-a'
  ]
  try {
    await act(async () => {
      root.render(createElement(Owner))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    for (const action of ['attach', 'shutdown']) {
      const pending = socket.run([...args, '--action', action])
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })
      await pending
      expect(container.querySelector('[data-session-readback]')?.textContent).toBe(
        `device-a:${action === 'attach'}:null`
      )
      expect(booted).toBe(action === 'attach')
      expect(bridge.getActiveForWorktree('folder:session')?.deviceUdid ?? null).toBe(
        action === 'attach' ? 'device-a' : null
      )
      expect(useAppStore.getState().unifiedTabsByWorktree['folder:session'][0].label).toBe(
        'Phone A'
      )
      if (action === 'attach') {
        for (const end of ['up', 'cancel']) {
          const pointer = socket.run([
            'pointer-view',
            '--worktree',
            'folder:session',
            '--tab-id',
            'sim',
            '--text',
            JSON.stringify([
              { type: 'down', clientX: 50, clientY: 80 },
              { type: 'move', clientX: 60, clientY: 100 },
              { type: end, clientX: 60, clientY: 100 }
            ])
          ])
          await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30))
          })
          await pointer
          expect(document.activeElement).toBe(container.querySelector('[data-emulator-screen]'))
          expect(
            container.querySelector('[data-emulator-screen]')?.getAttribute('aria-keyshortcuts')
          ).toBe('Escape')
        }
        expect(frames).toEqual([
          expect.objectContaining({ type: 'begin' }),
          expect.objectContaining({ type: 'move' }),
          expect.objectContaining({ type: 'end' }),
          expect.objectContaining({ type: 'begin' }),
          expect.objectContaining({ type: 'move' }),
          expect.objectContaining({ type: 'end' })
        ])
      }
    }
    expect([starts, stops]).toEqual([1, 1])
    useAppStore.setState({ settings: { ...settings, activeRuntimeEnvironmentId: 'paired-host' } })
    await expect(socket.run([...args, '--action', 'attach'])).rejects.toThrow()
    expect([starts, stops]).toEqual([1, 1])
    useAppStore.setState({ settings })
    socket.useLegacyPeer()
    await expect(socket.run([...args, '--action', 'attach'])).rejects.toThrow()
    expect([starts, stops]).toEqual([1, 1])
  } finally {
    await act(async () => root.unmount())
    cancelPendingSimulatorPaneShutdown('folder:session')
    await socket.close()
    for (const client of controlServer.clients) {
      client.terminate()
    }
    await new Promise<void>((resolve) => controlServer.close(() => resolve()))
    container.remove()
    useAppStore.setState(initial, true)
    if (api) {
      Object.defineProperty(window, 'api', api)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
