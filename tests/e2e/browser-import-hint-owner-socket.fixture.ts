import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { expect, vi } from 'vitest'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { BROWSER_IMPORT_HINT_SPECS } from '../../src/cli/specs/browser-import-hint'
import { BROWSER_IMPORT_HINT_HANDLERS } from '../../src/cli/handlers/browser-import-hint'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { BrowserImportHintButton } from '../../src/renderer/src/components/browser-pane/assemble-chrome/BrowserImportHintButton'
import { useAppStore } from '../../src/renderer/src/store'

export async function browserImportHintOwnerSocketFixture() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const directory = mkdtempSync(join(tmpdir(), 'orca-import-hint-'))
  const store = new Store({
    serializedState: JSON.stringify({ repos: [], settings: {} }),
    dataFile: join(directory, 'profile.json')
  })
  const runtime = new OrcaRuntimeService(store)
  const detect = vi.fn(async () => [
    {
      family: 'chrome',
      label: 'Fake Chrome',
      profiles: [{ name: 'Default', directory: 'Default' }],
      selectedProfile: 'Default'
    }
  ])
  const writeUI = vi.fn(async (updates: Parameters<Store['updateUI']>[0]) =>
    store.updateUI(updates)
  )
  const readUI = vi.fn(async () => store.getUI())
  Object.assign(window, {
    api: {
      browser: { sessionDetectBrowsers: detect, sessionDetectBrowsersForClientHost: detect },
      ui: { set: writeUI, get: readUI }
    }
  })
  useAppStore.setState({
    settings: store.getSettings(),
    persistedUIReady: true,
    activeView: 'terminal',
    activeModal: 'none',
    featureInteractions: {},
    browserImportHintHidden: false,
    detectedBrowsers: [],
    detectedBrowsersLoaded: false,
    browserSessionHostIdOverride: null,
    browserSessionImportState: null,
    browserPagesByWorkspace: {
      tab: [
        {
          id: 'page',
          workspaceId: 'tab',
          worktreeId: 'work',
          url: 'about:blank',
          title: '',
          loading: false,
          faviconUrl: null,
          canGoBack: false,
          canGoForward: false,
          loadError: null,
          createdAt: 1,
          browserRuntimeEnvironmentId: null
        }
      ]
    },
    browserTabsByWorktree: {
      work: [
        {
          id: 'tab',
          worktreeId: 'work',
          activePageId: 'page',
          sessionProfileId: 'default',
          url: 'about:blank',
          title: '',
          loading: false,
          faviconUrl: null,
          canGoBack: false,
          canGoForward: false,
          loadError: null,
          createdAt: 1
        }
      ]
    },
    activeWorktreeId: 'work',
    activeRepoId: null,
    projects: [],
    repos: [],
    worktreesByRepo: {},
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogSettled: true
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const Owner = ({
    copies,
    isActive,
    pageId,
    profileId
  }: {
    copies: number
    isActive: boolean
    pageId: string
    profileId: string
  }) => {
    const activeView = useAppStore((state) => state.activeView)
    return activeView === 'terminal'
      ? createElement(
          'div',
          {},
          Array.from({ length: copies }, (_, key) =>
            createElement(BrowserImportHintButton, {
              key,
              profileId,
              browserPageId: pageId,
              isActive
            })
          )
        )
      : null
  }
  const renderOwner = async (
    copies = 1,
    isActive = true,
    pageId = 'page',
    profileId = 'default'
  ): Promise<void> => {
    await act(async () =>
      root.render(createElement(Owner, { copies, isActive, pageId, profileId }))
    )
  }
  await renderOwner()
  runtime.setNotifier({
    browserViewer: async (command) => {
      const pending: { value?: ReturnType<typeof applyBrowserViewerRequest> } = {}
      await act(async () => {
        pending.value = applyBrowserViewerRequest({
          id: 'reset-fixture',
          expiresAt: Date.now() + 3000,
          command
        })
        void pending.value.catch(() => {})
        await Promise.resolve()
      })
      if (!pending.value) {
        throw new Error('fixture bridge did not start')
      }
      return { ...(await pending.value), viewerId: 9 }
    }
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
      if (request.authToken !== 'fixture-token') {
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
      authToken: 'fixture-token',
      startedAt: 1
    })
  )
  const client = new RuntimeClient(directory, 5000, null, null)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const invoke = async (action: string, extraFlags: string[] = []): Promise<void> => {
    const specs = BROWSER_IMPORT_HINT_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'import-hint',
        '--viewer',
        'host',
        '--host',
        'local',
        '--page',
        'page',
        '--profile',
        'default',
        '--action',
        action,
        ...extraFlags
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    const pending = BROWSER_IMPORT_HINT_HANDLERS['browser import-hint']({
      client,
      flags: parsed.flags,
      cwd: directory,
      json: true
    })
    let settled = false
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await vi.waitFor(
      async () => {
        await act(async () => {})
        expect(settled).toBe(true)
      },
      { timeout: 4500 }
    )
    await pending
  }
  return {
    directory,
    client,
    runtime,
    detect,
    writeUI,
    readUI,
    store,
    container,
    output,
    invoke,
    renderOwner,
    close: async () => {
      await act(async () => root.unmount())
      container.remove()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      vi.restoreAllMocks()
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
