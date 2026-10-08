import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { expect, vi } from 'vitest'
import type { ComputerUsePermissionResetResult } from '../../src/shared/computer-use-permissions-types'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { COMPUTER_PERMISSIONS_VIEWER_SPECS } from '../../src/cli/specs/computer-permissions-viewer'
import { COMPUTER_PERMISSIONS_VIEWER_HANDLERS } from '../../src/cli/handlers/computer-permissions-viewer'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { ComputerUsePane } from '../../src/renderer/src/components/settings/ComputerUsePane'
import { useAppStore } from '../../src/renderer/src/store'

export async function computerPermissionsOwnerSocketFixture() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const directory = mkdtempSync(join(tmpdir(), 'orca-permission-reset-'))
  const store = new Store({
    serializedState: JSON.stringify({ repos: [], settings: {} }),
    dataFile: join(directory, 'profile.json')
  })
  const runtime = new OrcaRuntimeService(store)
  const status: ComputerUsePermissionResetResult = {
    platform: 'darwin',
    helperAppPath: '/private/helper-fixture',
    helperUnavailableReason: null,
    bundleId: 'private-fixture-bundle',
    permissions: [
      { id: 'accessibility', status: 'granted' },
      { id: 'screenshots', status: 'granted' }
    ]
  }
  const getStatus = vi.fn(async () => ({ ...status, permissions: [...status.permissions] }))
  const reset = vi.fn(async () => ({ ...status, permissions: [...status.permissions] }))
  const openSetup = vi.fn(async () => ({ ...status, launchedHelper: false }))
  Object.assign(window, {
    api: {
      computerUsePermissions: { getStatus, reset, openSetup },
      ui: { recordFeatureInteraction: async () => store.getUI() }
    }
  })
  useAppStore.setState({
    settings: store.getSettings(),
    persistedUIReady: true,
    activeView: 'settings',
    activeModal: 'none'
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
          Array.from({ length: copies }, (_, key) => createElement(ComputerUsePane, { key }))
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
  const invoke = async (action: string, confirm?: string): Promise<void> => {
    const specs = COMPUTER_PERMISSIONS_VIEWER_SPECS
    const parsed = parseArgs(
      [
        'computer',
        'permissions',
        'viewer',
        '--viewer',
        'host',
        '--action',
        action,
        ...(confirm ? ['--confirm', confirm] : [])
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    const pending = COMPUTER_PERMISSIONS_VIEWER_HANDLERS['computer permissions viewer']({
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
    status,
    getStatus,
    reset,
    openSetup,
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
