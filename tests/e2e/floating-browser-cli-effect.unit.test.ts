// @vitest-environment happy-dom
import { useFloatingTerminalPanelStoreState } from '../../src/renderer/src/components/floating-terminal/use-floating-terminal-panel-store-state'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { cookieFixture } from './browser-settings-cookie.fixture'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createServer, type Socket } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { FLOATING_BROWSER_VIEWER_SPECS } from '../../src/cli/specs/floating-browser-viewer'
import { FLOATING_BROWSER_VIEWER_HANDLERS } from '../../src/cli/handlers/floating-browser-viewer'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { useAppStore } from '../../src/renderer/src/store'
import { useFloatingTerminalCreateActions } from '../../src/renderer/src/components/floating-terminal/use-floating-terminal-create-actions'
import { FLOATING_TERMINAL_WORKTREE_ID as workspace } from '../../src/shared/constants'
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'parses floating actions through socket/RPC/bridge into the actual mounted creation owner and store',
  async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const directory = mkdtempSync(join(tmpdir(), 'orca-floating-browser-'))
    cookieFixture.directory = directory
    const store = new Store({
      serializedState: JSON.stringify({ repos: [], settings: {} }),
      dataFile: join(directory, 'profile.json')
    })
    const runtime = new OrcaRuntimeService(store)
    Object.assign(window, {
      api: {
        ui: { set: async (updates: Parameters<Store['updateUI']>[0]) => store.updateUI(updates) }
      }
    })
    useAppStore.setState({
      settings: store.getSettings(),
      persistedUIReady: true,
      activeModal: 'none',
      browserDefaultUrl: 'https://private-fixture.invalid/home'
    })
    const groupId = useAppStore.getState().ensureWorktreeRootGroup(workspace)
    function Owner() {
      const state = useFloatingTerminalPanelStoreState()
      useFloatingTerminalCreateActions({
        activateTab: state.activateTab,
        setActiveTab: state.setActiveTab,
        createBrowserTab: state.createBrowserTab,
        browserDefaultUrl: state.browserDefaultUrl,
        openFile: state.openFile,
        activeGroup: state.groups.find((group) => group.id === groupId) ?? null,
        browserTabs: state.browserTabs,
        groupTabs: state.unifiedTabs,
        markdownCwd: null,
        viewerOpen: true
      })
      return null
    }
    const container = document.createElement('div')
    document.body.append(container)
    const owner = createRoot(container)
    await act(async () => owner.render(createElement(Owner)))
    runtime.setNotifier({
      browserViewer: async (command) => ({
        ...(await applyBrowserViewerRequest({
          id: 'floating-fixture',
          expiresAt: Date.now() + 1000,
          command
        })),
        viewerId: 3
      })
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_VIEWER_METHODS })
    const sockets = new Set<Socket>()
    const server = createServer((socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      let pending = ''
      socket.on('data', (chunk) => {
        pending += chunk.toString()
        const boundary = pending.indexOf('\n')
        if (boundary === -1) {
          return
        }
        const request = JSON.parse(pending.slice(0, boundary))
        pending = pending.slice(boundary + 1)
        if (request.authToken !== 'floating-fixture-token') {
          socket.destroy()
          return
        }
        void dispatcher
          .dispatch(request)
          .then((response) => socket.write(`${JSON.stringify(response)}\n`))
      })
    })
    const endpoint = join(directory, 'runtime.sock')
    await new Promise<void>((resolve) => server.listen(endpoint, resolve))
    writeFileSync(
      join(directory, 'orca-runtime.json'),
      JSON.stringify({
        runtimeId: runtime.getRuntimeId(),
        pid: process.pid,
        transports: [{ kind: 'unix', endpoint }],
        authToken: 'floating-fixture-token',
        startedAt: 1
      })
    )
    const client = new RuntimeClient(directory, 3000, null, null)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    async function invoke(action: string, flags: string[] = []) {
      const specs = FLOATING_BROWSER_VIEWER_SPECS
      const parsed = parseArgs(
        [
          'browser',
          'floating',
          'viewer',
          '--viewer',
          'host',
          '--group',
          groupId,
          '--action',
          action,
          ...flags
        ],
        specs.map((spec) => spec.path),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      const pending = FLOATING_BROWSER_VIEWER_HANDLERS['browser floating viewer']({
        client,
        flags: parsed.flags,
        cwd: directory,
        json: true
      })
      void pending.catch(() => {})
      let settled = false
      void pending.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        }
      )
      await vi.waitFor(async () => {
        await act(async () => {})
        expect(settled).toBe(true)
      })
      await pending
    }
    try {
      await invoke('new')
      const source = useAppStore.getState().browserTabsByWorktree[workspace]?.[0]
      if (!source) {
        throw new Error('Browser source missing')
      }
      const wrapper = useAppStore
        .getState()
        .unifiedTabsByWorktree[workspace]?.find((tab) => tab.entityId === source.id)
      if (!wrapper) {
        throw new Error('Browser wrapper missing')
      }
      expect(useAppStore.getState().pendingAddressBarFocusByPageId[source.activePageId ?? '']).toBe(
        true
      )
      await invoke('duplicate', ['--browser-tab', source.id, '--source-tab', wrapper.id])
      const tabs = useAppStore.getState().browserTabsByWorktree[workspace] ?? []
      expect(tabs).toHaveLength(2)
      expect(tabs[1].url).toBe(source.url)
      expect(tabs[1].sessionProfileId ?? null).toBe(source.sessionProfileId ?? null)
      expect(tabs[1].sessionPartition ?? null).toBe(source.sessionPartition ?? null)
      expect(useAppStore.getState().activeBrowserTabIdByWorktree[workspace]).toBe(tabs[1].id)
      expect(output.mock.calls.at(-1)?.[0]).toContain('"partitionPreserved": true')
      expect(JSON.stringify(output.mock.calls)).not.toContain('private-fixture')
      await act(async () =>
        useAppStore.setState({
          settings: { ...store.getSettings(), activeRuntimeEnvironmentId: 'remote-main-selection' }
        })
      )
      await invoke('new')
      const localPage =
        useAppStore.getState().browserPagesByWorkspace[
          useAppStore.getState().activeBrowserTabIdByWorktree[workspace] ?? ''
        ]?.[0]
      expect(localPage?.browserRuntimeEnvironmentId).toBeNull()
      await expect(
        applyBrowserViewerRequest({
          id: 'remote-zoom',
          expiresAt: Date.now() + 1000,
          command: { viewer: 'host', operation: 'zoom', page: 'missing', direction: 'reset' }
        })
      ).rejects.toThrow('viewer_runtime_mismatch')
      await expect(
        invoke('duplicate', ['--browser-tab', source.id, '--source-tab', 'wrong-wrapper'])
      ).rejects.toThrow('effect_unknown')
      expect(useAppStore.getState().browserTabsByWorktree[workspace]).toHaveLength(3)
    } finally {
      output.mockRestore()
      await act(async () => owner.unmount())
      container.remove()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
