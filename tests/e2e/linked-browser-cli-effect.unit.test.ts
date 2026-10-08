// @vitest-environment happy-dom
import * as desktopWindowChrome from '../../src/renderer/src/lib/desktop-window-chrome'
import {
  LinkedBrowserOwnerFixture,
  linkedWorkspace,
  linkedIssue,
  linkedReview
} from './linked-browser-owner.fixture'
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
import { LINKED_BROWSER_VIEWER_SPECS } from '../../src/cli/specs/linked-browser-viewer'
import { LINKED_BROWSER_VIEWER_HANDLERS } from '../../src/cli/handlers/linked-browser-viewer'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { useAppStore } from '../../src/renderer/src/store'
const workspace = linkedWorkspace.id
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'parses exact linked targets through socket/RPC/bridge into the actual hover, secondary callback and workspace browser stores',
  async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const directory = mkdtempSync(join(tmpdir(), 'orca-linked-browser-'))
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
    useAppStore.setState({ worktreesByRepo: { [linkedWorkspace.repoId]: [linkedWorkspace] } })
    useAppStore.getState().ensureWorktreeRootGroup(workspace)
    const container = document.createElement('div')
    document.body.append(container)
    const owner = createRoot(container)
    await act(async () => owner.render(createElement(LinkedBrowserOwnerFixture)))
    runtime.setNotifier({
      browserViewer: async (command) => ({
        ...(await applyBrowserViewerRequest({
          id: 'linked-fixture',
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
        if (request.authToken !== 'linked-fixture-token') {
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
        authToken: 'linked-fixture-token',
        startedAt: 1
      })
    )
    const client = new RuntimeClient(directory, 3000, null, null)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    let surface = 'card-details'
    async function invoke(kind: string, url: string, number: string, flags: string[] = []) {
      const specs = LINKED_BROWSER_VIEWER_SPECS
      const parsed = parseArgs(
        [
          'browser',
          'linked',
          'viewer',
          '--viewer',
          'host',
          '--worktree',
          workspace,
          '--execution-host',
          'local',
          '--surface',
          surface,
          '--kind',
          kind,
          '--number',
          number,
          '--url',
          url,
          ...flags
        ],
        specs.map((spec) => spec.path),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      const pending = LINKED_BROWSER_VIEWER_HANDLERS['browser linked viewer']({
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
      expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('true')
      await invoke('issue', linkedIssue.url, '41')
      const first = useAppStore.getState().browserTabsByWorktree[workspace]?.[0]
      expect(first?.url).toBe(linkedIssue.url)
      expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('false')
      expect(
        useAppStore.getState().pendingAddressBarFocusByPageId[first?.activePageId ?? '']
      ).not.toBe(true)
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-open-linked-hover]')?.click()
      })
      await invoke('review', linkedReview.url, '42')
      expect(useAppStore.getState().browserTabsByWorktree[workspace]).toHaveLength(2)
      expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('false')
      expect(JSON.stringify(output.mock.calls)).not.toContain('private-')
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-open-linked-hover]')?.click()
      })
      await act(async () =>
        useAppStore.setState({
          settings: { ...store.getSettings(), activeRuntimeEnvironmentId: 'other-main-runtime' }
        })
      )
      for (const targetSurface of ['card-identity', 'card-title'] as const) {
        surface = targetSurface
        await act(async () => {
          owner.render(createElement(LinkedBrowserOwnerFixture, { surface: targetSurface }))
        })
        await act(async () => {
          container.querySelector<HTMLButtonElement>('[data-open-linked-hover]')?.click()
        })
        await invoke('issue', linkedIssue.url, '41')
        expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('false')
      }
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-open-linked-hover]')?.click()
      })
      await expect(invoke('issue', 'https://wrong.invalid', '41')).rejects.toThrow('effect_unknown')
      expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('true')
      expect(useAppStore.getState().browserTabsByWorktree[workspace]).toHaveLength(4)
      await expect(invoke('review', linkedReview.url, '999')).rejects.toThrow('effect_unknown')
      expect(useAppStore.getState().browserTabsByWorktree[workspace]).toHaveLength(4)
      await expect(
        invoke('issue', linkedIssue.url, '41', ['--execution-host', 'runtime:wrong'])
      ).rejects.toThrow('effect_unknown')
      await expect(
        invoke('issue', linkedIssue.url, '41', ['--runtime-environment', 'wrong-runtime'])
      ).rejects.toThrow('effect_unknown')
      expect(useAppStore.getState().browserTabsByWorktree[workspace]).toHaveLength(4)
      expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('true')
      const paired = vi.spyOn(desktopWindowChrome, 'isPairedWebClientWindow').mockReturnValue(true)
      try {
        await expect(invoke('issue', linkedIssue.url, '41')).rejects.toThrow('effect_unknown')
        expect(useAppStore.getState().browserTabsByWorktree[workspace]).toHaveLength(4)
        expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('true')
      } finally {
        paired.mockRestore()
      }
      await expect(
        applyBrowserViewerRequest({
          id: 'linked-main-guard',
          expiresAt: Date.now() + 1000,
          command: { viewer: 'host', operation: 'zoom', page: 'missing', direction: 'reset' }
        })
      ).rejects.toThrow('viewer_runtime_mismatch')
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
