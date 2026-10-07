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
import { BROWSER_SETUP_GUIDE_SPECS } from '../../src/cli/specs/browser-setup-guide'
import { BROWSER_SETUP_GUIDE_HANDLERS } from '../../src/cli/handlers/browser-setup-guide'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { BrowserAction } from '../../src/renderer/src/components/feature-wall/FeatureWallBrowserAction'
import { useAppStore } from '../../src/renderer/src/store'

export async function browserSetupGuideOwnerSocketFixture() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const directory = mkdtempSync(join(tmpdir(), 'orca-setup-guide-'))
  const store = new Store({
    serializedState: JSON.stringify({ repos: [], settings: {} }),
    dataFile: join(directory, 'profile.json')
  })
  const runtime = new OrcaRuntimeService(store)
  let clipboard = ''
  const writeClipboardText = vi.fn(async (value: string): Promise<void> => {
    clipboard = value
  })
  const readClipboardText = vi.fn(async () => clipboard)
  const recordInteraction = vi.fn(async (id: Parameters<Store['recordFeatureInteraction']>[0]) =>
    store.recordFeatureInteraction(id)
  )
  Object.assign(window, {
    api: {
      ui: { recordFeatureInteraction: recordInteraction, writeClipboardText, readClipboardText }
    }
  })
  useAppStore.setState({
    settings: store.getSettings(),
    persistedUIReady: true,
    activeView: 'settings',
    activeModal: 'setup-guide',
    featureInteractions: {},
    activeWorktreeId: null,
    activeRepoId: null,
    projects: [],
    repos: [],
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogSettled: true
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const renderOwner = async (copies = 1): Promise<void> => {
    await act(async () =>
      root.render(
        createElement(
          'div',
          {},
          Array.from({ length: copies }, (_, key) =>
            createElement(BrowserAction, { key, done: true })
          )
        )
      )
    )
  }
  await renderOwner()
  runtime.setNotifier({
    browserViewer: async (command) => ({
      ...(await applyBrowserViewerRequest({
        id: 'reset-fixture',
        expiresAt: Date.now() + 3000,
        command
      })),
      viewerId: 9
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
  const invoke = async (action: string, confirm?: string, surface = 'modal'): Promise<void> => {
    const specs = BROWSER_SETUP_GUIDE_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'setup-guide',
        '--viewer',
        'host',
        '--action',
        action,
        '--runtime',
        'local',
        '--workspace',
        'none',
        '--surface',
        surface,
        ...(confirm ? ['--confirm', confirm] : [])
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    const pending = BROWSER_SETUP_GUIDE_HANDLERS['browser setup-guide']({
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
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(settled).toBe(true)
    })
    await pending
  }
  return {
    writeClipboardText,
    readClipboardText,
    recordInteraction,
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
