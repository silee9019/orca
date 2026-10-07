import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { createServer, type Socket } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { SEARCH_CONSENT_HANDLERS } from '../../src/cli/handlers/search-consent'
import { SEARCH_CONSENT_COMMAND_SPECS } from '../../src/cli/specs/search-consent'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { AI_VAULT_METHODS } from '../../src/main/runtime/rpc/methods/ai-vault'

const fixture = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../src/main/ai-vault-search/session-search-service-registry', () => ({
  sessionSearchServiceStatus: async () => ({
    enabled: fixture.enabled,
    phase: 'current',
    filesIndexed: 0,
    filesDue: 0,
    filesFailed: 0,
    degradedRoots: [],
    lastReconcileAt: null,
    lastSweepCompletedAt: null,
    generation: 1
  }),
  searchSessionService: vi.fn()
}))

afterEach(() => vi.restoreAllMocks())

it.skipIf(process.platform === 'win32')(
  'changes the existing host settings owner over a socket and rejects an unpaired caller',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-search-consent-'))
    const store = new Store({
      serializedState: JSON.stringify({ settings: { aiVaultSearch: { enabled: false } } }),
      dataFile: join(root, 'profile.json')
    })
    const runtime = new OrcaRuntimeService(store)
    const dispatcher = new RpcDispatcher({ runtime, methods: AI_VAULT_METHODS })
    const sockets = new Set<Socket>()
    let paired = true
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
        void dispatcher.dispatchStreaming(
          request,
          (response) => socket.write(`${response}\n`),
          paired ? { pairedDeviceId: 'fixture-paired-device', clientKind: 'runtime' } : {}
        )
      })
    })
    const endpoint = join(root, 'runtime.sock')
    try {
      await new Promise<void>((resolve) => server.listen(endpoint, resolve))
      writeFileSync(
        join(root, 'orca-runtime.json'),
        JSON.stringify({
          runtimeId: runtime.getRuntimeId(),
          pid: process.pid,
          transports: [{ kind: 'unix', endpoint }],
          authToken: 'fixture-token',
          startedAt: 1
        })
      )
      const client = new RuntimeClient(root, 5000, null, null)
      // The fixture injects paired identity at the server; it does not exercise pairing or E2EE.
      vi.spyOn(client, 'isRemote', 'get').mockReturnValue(true)
      const output = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      async function invoke(enabled: boolean) {
        const parsed = parseArgs(
          [
            'search',
            'consent',
            '--host',
            'runtime:fixture',
            '--enabled',
            String(enabled),
            '--confirm',
            'runtime:fixture'
          ],
          SEARCH_CONSENT_COMMAND_SPECS.map((spec) => spec.path)
        )
        validateCommandAndFlags(SEARCH_CONSENT_COMMAND_SPECS, parsed)
        const handler = SEARCH_CONSENT_HANDLERS['search consent']
        if (!handler) {
          throw new Error('Missing consent handler')
        }
        await handler({ client, flags: parsed.flags, cwd: root, json: true })
      }
      for (const enabled of [true, false]) {
        fixture.enabled = enabled
        await invoke(enabled)
        expect(store.getSettings().aiVaultSearch?.enabled).toBe(enabled)
        expect(output.mock.calls.at(-1)?.[0]).toContain(`"enabled": ${enabled}`)
      }
      paired = false
      fixture.enabled = true
      const before = output.mock.calls.length
      await expect(invoke(true)).rejects.toThrow('paired client')
      expect(store.getSettings().aiVaultSearch?.enabled).toBe(false)
      expect(output).toHaveBeenCalledTimes(before)
    } finally {
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(root, { recursive: true, force: true })
    }
  }
)
