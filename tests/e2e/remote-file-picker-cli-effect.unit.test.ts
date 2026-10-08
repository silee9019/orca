// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { createElement, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock(import('@/runtime/runtime-rpc-client'), async (original) => ({
  ...(await original()),
  callRuntimeRpc: vi.fn(async () => ({ ok: true }))
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
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
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
import { CreateProjectParentBrowser } from '../../src/renderer/src/components/sidebar/CreateProjectLocationField'
import { Dialog } from '../../src/renderer/src/components/ui/dialog'
import { RemoteFilePickerState } from '../../src/shared/rpc-contract/remote-file-picker-params'
import { z } from 'zod'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
it.each([
  { kind: 'ssh', action: 'select' },
  { kind: 'runtime', action: 'select' },
  { kind: 'ssh', action: 'cancel' },
  { kind: 'runtime', action: 'cancel' },
  { kind: 'ssh', action: 'row-select' },
  { kind: 'runtime', action: 'row-select' }
] as const)(
  'uses the actual %s parent picker through CLI/socket and reads the parent draft after selection',
  async ({ kind, action }) => {
    expect(initial.activeModal).toBe('none')
    const targetId = kind === 'ssh' ? 'ssh-fixture' : 'env-fixture'
    const provider: { browsed: string[] } = { browsed: [] }
    vi.mocked(callRuntimeRpc).mockImplementation(async (target, method, params) => {
      expect(target).toEqual({ kind: 'environment', environmentId: 'env-fixture' })
      expect(method).toBe('files.browseServerDir')
      const request = z.object({ path: z.string() }).parse(params)
      provider.browsed.push(request.path)
      return {
        resolvedPath: request.path === '~' ? '/home/fixture' : request.path,
        entries: [{ name: 'folder', isDirectory: true }],
        pathFlavor: 'posix'
      }
    })
    Object.defineProperty(globalThis.window, 'api', {
      configurable: true,
      value: {
        ui: { set: async () => ({}) },
        ssh: {
          browseDir: async ({ targetId, dirPath }: { targetId: string; dirPath: string }) => {
            expect(targetId).toBe('ssh-fixture')
            provider.browsed.push(dirPath)
            return {
              resolvedPath: dirPath === '~' ? '/home/fixture' : dirPath,
              entries: [{ name: 'folder', isDirectory: true }],
              pathFlavor: 'posix'
            }
          }
        }
      }
    })
    useAppStore.setState(
      { ...initial, persistedUIReady: true, settings: getDefaultSettings('/fixture/home') },
      true
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

    function Owner() {
      const [parent, setParent] = useState('')
      const [browsing, setBrowsing] = useState(true)
      return createElement(
        Dialog,
        { open: true },
        browsing
          ? createElement(CreateProjectParentBrowser, {
              sshTargetId: kind === 'ssh' ? targetId : null,
              runtimeEnvironmentId: kind === 'runtime' ? targetId : null,
              createParent: parent,
              onParentChange: setParent,
              onClose: () => setBrowsing(false)
            })
          : createElement('div', { 'data-testid': 'parent-draft' }, parent)
      )
    }
    const view = render(createElement(Owner))
    const cli = await createRemotePaneCliSocket(runtime)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = async (action: string, instance?: string, extra: string[] = []) => {
      let running: Promise<void> | undefined
      await act(async () => {
        running = cli.runPicker([
          '--target-kind',
          kind,
          '--target',
          targetId,
          '--action',
          action,
          ...(instance ? ['--picker-instance', instance] : []),
          ...extra
        ])
        void running.catch(() => {})
        await new Promise((resolve) => setTimeout(resolve, action === 'row-click' ? 250 : 20))
      })
      if (!running) {
        throw new Error('CLI not started')
      }
      await running
      const printed = output.mock.lastCall?.[0]
      if (typeof printed !== 'string') {
        throw new Error('missing CLI output')
      }
      return z
        .object({ result: z.object({ remotePicker: RemoteFilePickerState }) })
        .parse(JSON.parse(printed)).result.remotePicker
    }
    try {
      let state = await run('status')
      expect(state.resolvedPath).toBe('/home/fixture')
      state = await run('input', state.instance, ['--text', 'fold'])
      expect(state.filter).toBe('fold')
      expect(provider.browsed).toEqual(['~'])
      state = await run('key', state.instance, ['--key', 'Enter'])
      expect(state.resolvedPath).toBe('/home/fixture/folder')
      state = await run('paste', state.instance, ['--text', '/folder/'])
      await waitFor(async () => {
        state = await run('status')
        expect(state.previewPath).toBe('/folder')
        expect(state.previewLoading).toBe(false)
      })
      await expect(run('select', state.instance)).rejects.toThrow('selection_disabled')
      view.getByPlaceholderText('Type to filter or enter a path…').blur()
      state = await run('focus-input', state.instance)
      expect(state.inputFocused).toBe(true)
      state = await run('row-click', state.instance, ['--entry', 'folder'])
      expect(state.resolvedPath).toBe('/folder/folder')
      state = await run('key', state.instance, ['--key', 'Backspace'])
      expect(state.resolvedPath).toBe('/folder')
      state = await run('input', state.instance, ['--text', ''])
      expect(state.filter).toBe('')
      state = await run('navigate', state.instance, ['--path', '/chosen/leaf'])
      expect(state.resolvedPath).toBe('/chosen/leaf')
      state = await run('up', state.instance)
      expect(state.resolvedPath).toBe('/chosen')
      state = await run(
        action === 'cancel' ? 'key' : action,
        state.instance,
        action === 'row-select'
          ? ['--entry', 'folder']
          : action === 'cancel'
            ? ['--key', 'Escape']
            : []
      )
      const chosenPath = action === 'row-select' ? '/chosen/folder' : '/chosen'
      if (action !== 'cancel') {
        expect(state.selectedPath).toBe(chosenPath)
      } else {
        expect(state.canceled).toBe(true)
      }
      expect(view.getByTestId('parent-draft').textContent).toBe(
        action !== 'cancel' ? chosenPath : ''
      )
      expect(view.queryByPlaceholderText('Type to filter or enter a path…')).toBeNull()
      expect(provider.browsed).toEqual([
        '~',
        '/home/fixture/folder',
        '/',
        '/folder',
        '/folder/folder',
        '/chosen/leaf',
        '/chosen'
      ])
      await expect(run('select', state.instance)).rejects.toThrow('remote_picker_unavailable')
      cli.useLegacyPeer()
      await expect(run('status')).rejects.toMatchObject({ code: 'incompatible_runtime' })
    } finally {
      await cli.close()
    }
  }
)
