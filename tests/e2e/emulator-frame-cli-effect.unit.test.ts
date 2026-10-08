// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import type * as Manifest from '../../src/cli/handler-group-manifest'
import { act, createElement, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('../../src/cli/handler-group-manifest', async () => {
  const actual = await vi.importActual<typeof Manifest>('../../src/cli/handler-group-manifest')
  return {
    ...actual,
    HANDLER_GROUPS: actual.HANDLER_GROUPS.map((group) =>
      group.name === 'emulator'
        ? {
            ...group,
            keys: [
              ...new Set([
                ...group.keys,
                'emulator wheel',
                'emulator screen-key',
                'emulator screen-paste',
                'emulator rotate-view',
                'emulator focus-group',
                'emulator select-tab'
              ])
            ]
          }
        : group
    )
  }
})
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 7
      isDestroyed = () => false
      webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
    }
  }
})
vi.mock(
  '../../src/renderer/src/components/emulator-pane/use-emulator-stream-window-visibility',
  () => ({ useEmulatorStreamWindowVisible: () => true })
)
const touch = vi.hoisted(() => vi.fn((_point: unknown) => true))
const keyboard = vi.hoisted(() => vi.fn(() => true))
const rotateRpc = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rotateRpc }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: (worktreeId: string) => {
    useAppStore.setState({ activeWorktreeId: worktreeId })
    return true
  }
}))
vi.mock('../../src/renderer/src/components/emulator-pane/use-emulator-control-stream', () => ({
  useEmulatorControlStream: () => ({
    sendTouch: touch,
    sendKeyboardFrames: keyboard,
    cancelKeyboardFrames: vi.fn()
  })
}))
vi.mock('../../src/renderer/src/components/emulator-pane/emulator-screen-stream-content', () => ({
  EmulatorScreenStreamContent: ({ streamError }: { streamError: boolean }) =>
    createElement('span', null, streamError ? 'stream-error' : 'stream-ok')
}))
import { BrowserWindow, ipcMain } from 'electron'
import { main } from '../../src/cli/index'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RuntimeEmulatorCommands } from '../../src/main/runtime/orca-runtime-emulator'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { EMULATOR_CONTROL_METHODS } from '../../src/main/runtime/rpc/methods/emulator-control'
import { getRuntimeMetadataPath } from '../../src/shared/runtime-bootstrap'
import { EmulatorDeviceFrame } from '../../src/renderer/src/components/emulator-pane/emulator-device-frame'
import { applyEmulatorFrame } from '../../src/renderer/src/runtime/emulator-frame-bridge'
import type { EmulatorFocusRequest } from '../../src/shared/emulator-focus'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import type { Worktree } from '../../src/shared/worktree/types'
import { useEmulatorPaneCommands } from '../../src/renderer/src/components/emulator-pane/use-emulator-pane-commands'
import { useEmulatorPaneControls } from '../../src/renderer/src/components/emulator-pane/use-emulator-pane-controls'
import { useWorktreeJumpPaletteSelectionActions } from '../../src/renderer/src/components/use-worktree-jump-palette-selection-actions'
const initialStore = useAppStore.getInitialState()
const skipRestoreFocusRef = { current: false }
const selectedItem = vi.fn()
function FixturePaneOwner() {
  const paneRef = useRef<HTMLDivElement>(null)
  const controls = useEmulatorPaneControls('folder-mobile', vi.fn())
  useEmulatorPaneCommands(paneRef, controls.sendRotate, true)
  useWorktreeJumpPaletteSelectionActions({
    closeModal: useAppStore.getState().closeModal,
    recordFeatureInteraction: vi.fn(),
    openSettingsTarget: vi.fn(),
    openSettingsPage: vi.fn(),
    revealSidebarRow: vi.fn(),
    skipRestoreFocusRef,
    setSelectedItemId: selectedItem,
    previousActiveTabTypeRef: useRef<'terminal'>('terminal'),
    previousBrowserPageIdRef: useRef<string | null>(null),
    previousBrowserFocusTargetRef: useRef<'webview'>('webview'),
    previousWorktreeIdRef: useRef<string | null>(null),
    previousFocusElementRef: useRef<HTMLElement | null>(null),
    focusFallbackSurface: vi.fn(),
    requestBrowserFocus: vi.fn(),
    buildQuickActionContext: vi.fn()
  })
  return createElement(
    'div',
    { ref: paneRef, 'data-emulator-pane': true },
    createElement(EmulatorDeviceFrame, {
      loading: false,
      isLive: true,
      isActive: true,
      visualOrientation: controls.visualOrientation,
      onTap: vi.fn(),
      onGesture: vi.fn()
    })
  )
}
function seedViewer() {
  const worktree: Worktree = {
    id: 'folder-mobile',
    repoId: 'repo',
    path: '/fixture/folder',
    head: '',
    branch: '',
    isBare: false,
    isMainWorktree: false,
    displayName: 'Folder',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
  useAppStore.setState(
    {
      ...initialStore,
      settings: getDefaultSettings('/fixture/home'),
      persistedUIReady: true,
      activeWorktreeId: worktree.id,
      worktreesByRepo: { repo: [worktree] },
      groupsByWorktree: {
        [worktree.id]: [
          { id: 'group', worktreeId: worktree.id, activeTabId: 'sim', tabOrder: ['sim'] }
        ]
      },
      activeGroupIdByWorktree: { [worktree.id]: 'other' },
      unifiedTabsByWorktree: {
        [worktree.id]: [
          {
            id: 'sim',
            entityId: 'sim-entity',
            groupId: 'group',
            worktreeId: worktree.id,
            contentType: 'simulator',
            executionHostId: 'local',
            label: 'Simulator',
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 0
          }
        ]
      }
    },
    true
  )
}
const Request = z.object({
  id: z.string(),
  authToken: z.string(),
  method: z.string(),
  params: z.unknown()
})
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
afterEach(() => {
  useAppStore.setState(initialStore, true)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  ipcMain.removeAllListeners()
  process.exitCode = undefined
})

it('runs CLI → socket → dispatcher → relay → existing frame owner and rejects missing or remote targets', async () => {
  seedViewer()
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-frame-cli-'))
  const container = document.createElement('div')
  container.dataset.emulatorTabId = 'sim'
  document.body.append(container)
  const root = createRoot(container)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 200)
  )
  act(() => root.render(createElement(FixturePaneOwner)))
  const window = new BrowserWindow()
  vi.mocked(window.webContents.send).mockImplementation(
    (_channel, request: EmulatorFocusRequest) => {
      let pending: Promise<unknown> | undefined
      act(() => {
        pending = applyEmulatorFrame(request)
      })
      if (!pending) {
        throw new Error('Missing renderer request')
      }
      void pending.then(
        (result) =>
          ipcMain.emit(
            'emulator:focusResponse',
            { sender: window.webContents },
            { id: request.id, ok: true, result }
          ),
        () =>
          ipcMain.emit(
            'emulator:focusResponse',
            { sender: window.webContents },
            { id: request.id, ok: false, error: 'emulator_frame_not_applied' }
          )
      )
    }
  )
  const runtime = new OrcaRuntimeService()
  const commands = new RuntimeEmulatorCommands({
    getEmulatorBridge: () => null,
    resolveEmulatorWorkspaceId: async (selector) => selector,
    resolveEmulatorCleanupWorkspaceId: async (selector) => selector,
    getAuthoritativeWindow: () => window,
    getSettings: () => ({
      mobileEmulatorEnabled: true,
      mobileEmulatorDefaultDeviceUdid: null,
      androidSdkPath: null
    })
  })
  vi.spyOn(runtime, 'emulatorFrame').mockImplementation((params, signal) =>
    commands.emulatorFrame(params, signal)
  )
  const dispatcher = new RpcDispatcher({ runtime, methods: EMULATOR_CONTROL_METHODS })
  const endpoint = path.join(dir, 'runtime.sock')
  const server = createServer((socket) => {
    socket.setEncoding('utf8')
    let pending = ''
    socket.on('data', (chunk) => {
      pending += chunk.toString()
      const index = pending.indexOf('\n')
      if (index === -1) {
        return
      }
      const request = Request.parse(JSON.parse(pending.slice(0, index)))
      if (request.authToken !== 'fixture-token') {
        throw new Error('Wrong fixture token')
      }
      void dispatcher.dispatch(request).then((reply) => socket.end(`${JSON.stringify(reply)}\n`))
    })
  })
  server.listen(endpoint)
  await once(server, 'listening')
  try {
    await writeFile(
      getRuntimeMetadataPath(dir),
      JSON.stringify({
        runtimeId: runtime.getRuntimeId(),
        pid: process.pid,
        transports: [{ kind: 'unix', endpoint }],
        authToken: 'fixture-token',
        startedAt: Date.now()
      })
    )
    for (const name of ['ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING', 'ORCA_ENVIRONMENT']) {
      vi.stubEnv(name, '')
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', dir)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = async (tab = 'sim') =>
      main(
        [
          'emulator',
          'wheel',
          '--worktree',
          'folder-mobile',
          '--tab-id',
          tab,
          '--x',
          '50',
          '--y',
          '100',
          '--delta-y',
          '10',
          '--json'
        ],
        dir
      )
    await run()
    expect(
      process.exitCode,
      JSON.stringify({ errors: errors.mock.calls, output: output.mock.calls })
    ).toBeUndefined()
    expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"applied": true'))
    expect(touch.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({ type: 'begin' }),
      expect.objectContaining({ type: 'move' }),
      expect.objectContaining({ type: 'end' })
    ])
    const owner = async (command: string, flags: string[] = []) =>
      main(
        ['emulator', command, '--worktree', 'folder-mobile', '--tab-id', 'sim', ...flags, '--json'],
        dir
      )
    await owner('screen-key', ['--key', 'Enter'])
    expect(
      process.exitCode,
      JSON.stringify({ errors: errors.mock.calls, output: output.mock.calls })
    ).toBeUndefined()
    expect(keyboard).not.toHaveBeenCalled()
    await owner('screen-paste', ['--text', 'a'.repeat(30)])
    expect(
      process.exitCode,
      JSON.stringify({ errors: errors.mock.calls, output: output.mock.calls })
    ).toBeUndefined()
    expect(keyboard.mock.calls.length).toBeGreaterThan(1)
    keyboard.mockClear()
    await owner('screen-key', ['--key', 'Escape'])
    expect(
      process.exitCode,
      JSON.stringify({ errors: errors.mock.calls, output: output.mock.calls })
    ).toBeUndefined()
    expect(keyboard).not.toHaveBeenCalled()
    await owner('rotate-view')
    expect(
      process.exitCode,
      JSON.stringify({ errors: errors.mock.calls, output: output.mock.calls })
    ).toBeUndefined()
    expect(rotateRpc).toHaveBeenLastCalledWith({ kind: 'local' }, 'emulator.rotate', {
      orientation: 'landscape_left',
      worktree: 'folder-mobile'
    })
    expect(output).toHaveBeenLastCalledWith(
      expect.stringContaining('"visualOrientation": "landscape"')
    )
    await owner('focus-group', ['--group-id', 'group'])
    expect(
      process.exitCode,
      JSON.stringify({ errors: errors.mock.calls, output: output.mock.calls })
    ).toBeUndefined()
    expect(useAppStore.getState().activeGroupIdByWorktree['folder-mobile']).toBe('group')
    await owner('select-tab', ['--execution-host', 'local'])
    expect(
      process.exitCode,
      JSON.stringify({ errors: errors.mock.calls, output: output.mock.calls })
    ).toBeUndefined()
    expect(useAppStore.getState().activeTabType).toBe('simulator')
    expect(skipRestoreFocusRef.current).toBe(true)
    expect(selectedItem).toHaveBeenCalledWith('')
    await run('missing')
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
    useAppStore.setState({
      settings: { ...getDefaultSettings('/fixture/home'), activeRuntimeEnvironmentId: 'remote' }
    })
    await run()
    expect(process.exitCode).toBe(1)
    expect(container.textContent).toContain('stream-ok')
  } finally {
    useAppStore.setState({ settings: getDefaultSettings('/fixture/home') })
    act(() => root.unmount())
    container.remove()
    server.close()
    await once(server, 'close')
    await rm(dir, { recursive: true, force: true })
  }
})
