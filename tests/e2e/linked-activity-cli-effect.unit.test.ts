// @vitest-environment happy-dom
import {
  LinkedActivityOwnerFixture,
  seedLinkedActivityCache,
  linkedWorkspace,
  linkedReview
} from './linked-browser-owner.fixture'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { cookieFixture } from './browser-settings-cookie.fixture'
import { act, createElement, type ReactNode } from 'react'
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
import * as webRuntimeSession from '../../src/renderer/src/runtime/web-runtime-session'
import { BROWSER_SCREENCAST_RUNTIME_CAPABILITY } from '../../src/shared/protocol-version'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { LINKED_BROWSER_VIEWER_SPECS } from '../../src/cli/specs/linked-browser-viewer'
import { LINKED_BROWSER_VIEWER_HANDLERS } from '../../src/cli/handlers/linked-browser-viewer'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/renderer/src/components/ui/hover-card', () => ({
  HoverCard: ({
    children,
    open,
    onOpenChange
  }: {
    children: ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) =>
    createElement(
      'div',
      {},
      createElement('output', { 'data-linked-hover': true }, String(open)),
      createElement(
        'button',
        { 'data-open-linked-hover': true, onClick: () => onOpenChange?.(true) },
        'Open fixture hover'
      ),
      children
    ),
  HoverCardContent: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-activity-content': true }, children),
  HoverCardTrigger: ({ children }: { children: ReactNode }) => children
}))
const workspace = linkedWorkspace.id
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'parses activity linked review through socket/RPC/bridge into actual activity content and cached data/secondary/workspace browser owners',
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
    seedLinkedActivityCache()
    const container = document.createElement('div')
    document.body.append(container)
    const owner = createRoot(container)
    await act(async () => owner.render(createElement(LinkedActivityOwnerFixture)))
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
          'activity',
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
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-open-linked-hover]')?.click()
      })
      expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('true')
      await invoke('review', linkedReview.url, '42')
      const first = useAppStore.getState().browserTabsByWorktree[workspace]?.[0]
      expect(first?.url).toBe(linkedReview.url)
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
      await expect(invoke('issue', 'https://wrong.invalid', '41')).rejects.toThrow('effect_unknown')
      expect(container.querySelector('[data-linked-hover]')?.textContent).toBe('true')
      expect(useAppStore.getState().browserTabsByWorktree[workspace]).toHaveLength(2)
      await expect(invoke('review', linkedReview.url, '999')).rejects.toThrow('effect_unknown')
      expect(useAppStore.getState().browserTabsByWorktree[workspace]).toHaveLength(2)
      const environmentId = 'linked-runtime-fixture'
      const remoteWorkspace = {
        ...linkedWorkspace,
        hostId: 'runtime:linked-runtime-fixture',
        runtimeOwnerEnvironmentId: environmentId
      } as const
      await act(async () => {
        useAppStore.setState({
          activeWorktreeId: workspace,
          activeWorkspaceExecutionHostId: remoteWorkspace.hostId,
          worktreesByRepo: { [remoteWorkspace.repoId]: [remoteWorkspace] },
          settings: { ...store.getSettings(), activeRuntimeEnvironmentId: 'other-main-selection' },
          runtimeStatusByEnvironmentId: new Map([
            [
              environmentId,
              {
                status: {
                  ...runtime.getStatus(),
                  capabilities: [BROWSER_SCREENCAST_RUNTIME_CAPABILITY]
                },
                checkedAt: Date.now()
              }
            ]
          ])
        })
        owner.render(createElement(LinkedActivityOwnerFixture, { worktree: remoteWorkspace }))
      })
      const provider = vi
        .spyOn(webRuntimeSession, 'createWebRuntimeSessionBrowserTab')
        .mockImplementation(async (request) => {
          await new Promise<void>((resolve) => setTimeout(resolve, 10))
          expect(container.querySelector('[data-activity-content]')).toBeNull()
          useAppStore.getState().createBrowserTab(request.worktreeId, request.url, {
            browserRuntimeEnvironmentId: request.environmentId
          })
          return true
        })
      try {
        await invoke('review', linkedReview.url, '42', [
          '--execution-host',
          remoteWorkspace.hostId,
          '--runtime-environment',
          environmentId
        ])
        const remoteTab = useAppStore.getState().browserTabsByWorktree[workspace]?.at(-1)
        expect(
          useAppStore.getState().browserPagesByWorkspace[remoteTab?.id ?? '']?.[0]
            .browserRuntimeEnvironmentId
        ).toBe(environmentId)
        expect(container.querySelector('[data-activity-content]')).toBeNull()
        expect(JSON.stringify(output.mock.calls)).not.toContain('private-')
        await act(async () => {
          container.querySelector<HTMLButtonElement>('[data-open-linked-hover]')?.click()
        })
        provider.mockImplementation(async (request) => {
          useAppStore.getState().createBrowserTab(request.worktreeId, request.url, {
            browserRuntimeEnvironmentId: request.environmentId
          })
          return false
        })
        const acknowledgements = output.mock.calls.length
        await expect(
          invoke('review', linkedReview.url, '42', [
            '--execution-host',
            remoteWorkspace.hostId,
            '--runtime-environment',
            environmentId
          ])
        ).rejects.toThrow('effect_unknown')
        expect(output.mock.calls).toHaveLength(acknowledgements)
      } finally {
        provider.mockRestore()
      }
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
