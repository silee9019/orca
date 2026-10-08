// @vitest-environment happy-dom
import {
  renderPreview,
  storeState,
  clipboard,
  store,
  ABSOLUTE_PATH,
  GRANT_ID,
  installDocPreviewTestApi
} from '../../src/renderer/src/components/browser-pane/workspace-doc/doc-preview-owner-test-fixture'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createServer, type Socket } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { BROWSER_DOCUMENT_COMMAND_SPECS } from '../../src/cli/specs/browser-document'
import { BROWSER_DOCUMENT_HANDLERS } from '../../src/cli/handlers/browser-document'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'

it.skipIf(process.platform === 'win32')(
  'uses the CLI socket and runtime dispatcher to read the mounted document owner',
  async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    installDocPreviewTestApi()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    await renderPreview(container, root)
    storeState.settings.activeRuntimeEnvironmentId = null
    const directory = mkdtempSync(join(tmpdir(), 'orca-document-cli-'))
    const persistence = new Store({
      serializedState: '{}',
      dataFile: join(directory, 'profile.json')
    })
    const runtime = new OrcaRuntimeService(persistence)
    runtime.setNotifier({
      browserViewer: (command) =>
        applyBrowserViewerRequest({
          id: 'document-fixture',
          command,
          expiresAt: Date.now() + 2000
        })
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_VIEWER_METHODS })
    const sockets = new Set<Socket>()
    const server = createServer((socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      let pending = ''
      socket.on('data', (data) => {
        pending += data.toString()
        const end = pending.indexOf('\n')
        if (end === -1) {
          return
        }
        const request = JSON.parse(pending.slice(0, end))
        pending = pending.slice(end + 1)
        if (request.authToken !== 'document-fixture-token') {
          socket.destroy()
          return
        }
        void dispatcher
          .dispatch(request)
          .then((response) => socket.write(`${JSON.stringify(response)}\n`))
      })
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const endpoint = join(directory, 'runtime.sock')
      await new Promise<void>((resolve) => server.listen(endpoint, resolve))
      writeFileSync(
        join(directory, 'orca-runtime.json'),
        JSON.stringify({
          runtimeId: runtime.getRuntimeId(),
          pid: process.pid,
          transports: [{ kind: 'unix', endpoint }],
          authToken: 'document-fixture-token',
          startedAt: 1
        })
      )
      const client = new RuntimeClient(directory, 5000, null, null)
      for (const action of ['status', 'copy-path', 'open-source']) {
        const parsed = parseArgs(
          ['browser', 'document', '--viewer', 'host', '--page', 'preview-1', '--action', action],
          BROWSER_DOCUMENT_COMMAND_SPECS.map((spec) => spec.path)
        )
        validateCommandAndFlags(BROWSER_DOCUMENT_COMMAND_SPECS, parsed)
        const handler = BROWSER_DOCUMENT_HANDLERS['browser document']
        if (!handler) {
          throw new Error('missing document handler')
        }
        await act(async () => handler({ client, flags: parsed.flags, cwd: directory, json: true }))
        expect(output.mock.calls.at(-1)?.[0]).toContain('"applied": true')
        expect(output.mock.calls.at(-1)?.[0]).toContain('"rendered": false')
      }
      expect(clipboard.writes).toEqual([ABSOLUTE_PATH])
      expect(store.openedFiles).toEqual([
        expect.objectContaining({ filePath: ABSOLUTE_PATH, worktreeId: 'wt-1' })
      ])
      expect(output.mock.calls.flat().join(' ')).not.toContain(GRANT_ID)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      output.mockRestore()
      for (const socket of sockets) {
        socket.destroy()
      }
      if (server.listening) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
      }
      rmSync(directory, { recursive: true, force: true })
      vi.unstubAllGlobals()
    }
  }
)
