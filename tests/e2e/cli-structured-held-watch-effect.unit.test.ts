import * as registry from '../../src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import {
  ensureStructuredAgentSessionHost,
  stopStructuredAgentSessionRuntime
} from '../../src/main/runtime/structured-agent-session-runtime'
import { createStructuredAgentSessionLogger } from '../../src/main/native-chat/agent-session-wire/structured-agent-session-logger'
import { setStructuredAgentSessionHost } from '../../src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { main } from '../../src/cli/index'
import { STATUS_METHODS } from '../../src/main/runtime/rpc/methods/status'
import { readMetadata } from '../../src/cli/runtime/metadata'
import { getActiveRuntimeJsonEventStreamCount } from '../../src/main/runtime/runtime-json-event-subscription'

it.each([
  'local',
  'paired',
  'old-local',
  'old-paired',
  'invalid-request',
  'empty-host',
  'cancelled'
])(
  'observes canonical structured session held changes with host and lifetime boundaries: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-held-watch-'))
    const disposals: ReturnType<typeof vi.fn>[] = []
    const subscribe = registry.onStructuredAgentSessionsHeldChanged
    vi.spyOn(registry, 'onStructuredAgentSessionsHeldChanged').mockImplementation((listener) => {
      const dispose = vi.fn(subscribe(listener))
      disposals.push(dispose)
      return dispose
    })
    const runtime = new OrcaRuntimeService(null)
    const installHost = () =>
      ensureStructuredAgentSessionHost({
        stateDirectory: root,
        hostId: 'local',
        claimKeyId: 'fixture-key',
        resolveWorkspacePath: async () => root,
        resolveClaudeAuthPolicy: () => ({ stripAuthEnv: true }),
        resolveEnvironment: async () => ({}),
        logger: createStructuredAgentSessionLogger()
      })
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    const paired = mode === 'paired' || mode === 'old-paired'
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath: root,
      enableWebSocket: paired,
      wsPort: 0,
      pinnedBindHost: '127.0.0.1',
      ...(mode === 'old-paired' ? { methods: STATUS_METHODS } : {})
    })
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    const frames: unknown[] = []
    vi.spyOn(console, 'log').mockImplementation((value: unknown) =>
      frames.push(JSON.parse(String(value)))
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let interrupt: (() => void) | undefined
    if (mode === 'cancelled') {
      const original = process.on
      vi.spyOn(process, 'on').mockImplementation((event, listener) => {
        if (event === 'SIGINT') {
          interrupt = () => listener()
          return process
        }
        return original.call(process, event, listener)
      })
    }
    let pending: Promise<void> | undefined
    try {
      await server.start()
      const secret = readMetadata(root).authToken
      let pairingSecret: string | undefined
      if (paired) {
        const offer = server.createPairingOffer({
          address: '127.0.0.1',
          name: 'fixture-held-watch',
          scope: 'runtime'
        })
        if (!offer.available) {
          throw new Error('Fixture pairing unavailable')
        }
        pairingSecret = offer.pairingUrl
        vi.stubEnv('ORCA_PAIRING_CODE', pairingSecret)
        await rm(join(root, 'orca-runtime.json'))
      } else if (mode === 'old-local') {
        await writeFile(
          join(root, 'orca-runtime.json'),
          JSON.stringify({ ...readMetadata(root), structuredHeldStreaming: undefined })
        )
      }
      const file = join(root, 'watch.json')
      await writeFile(
        file,
        JSON.stringify(
          mode === 'invalid-request' ? { watchMs: 0, unknown: true } : { watchMs: 1000 }
        )
      )
      pending = main(['agent', 'session', 'watch-held', '--request-file', file, '--json'], root)
      if (['old-local', 'old-paired', 'invalid-request'].includes(mode)) {
        await pending
        expect(process.exitCode).toBe(1)
        expect(frames).toContainEqual(
          expect.objectContaining({
            ok: false,
            error: expect.objectContaining({
              code:
                mode === 'old-local'
                  ? 'method_not_supported'
                  : mode === 'old-paired'
                    ? 'method_not_found'
                    : mode === 'invalid-request'
                      ? 'invalid_argument'
                      : 'invalid_argument'
            })
          })
        )
        expect(getActiveRuntimeJsonEventStreamCount(runtime, 'structuredHeld')).toBe(0)
        return
      }
      await vi.waitFor(() =>
        expect(frames).toContainEqual(expect.objectContaining({ type: 'ready' }))
      )
      if (mode === 'cancelled') {
        if (!interrupt) {
          throw new Error('Fixture interrupt unavailable')
        }
        interrupt()
      } else {
        const host = await installHost()
        if (mode !== 'empty-host') {
          await host.deps.store.reserveOwner({
            sessionId: 'fixture-session',
            location: {
              executionHostId: 'local',
              wslDistro: null,
              workspaceId: root,
              workspaceKind: 'folder'
            },
            provider: 'claude',
            accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: join(root, 'claude') },
            expectedFence: null,
            spawnToken: 'fixture-spawn',
            claimKeyId: 'fixture-key',
            handoffOperationId: null,
            probe: { outcome: 'indeterminate', reason: 'fixture' },
            operation: {
              callerKey: 'desktop',
              operationId: `${Date.now()}-${'c1'.padStart(32, '0')}`,
              fingerprint: 'fixture-fp'
            },
            now: Date.now()
          })
          setStructuredAgentSessionHost(null)
        }
      }
      await pending
      expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : 0)
      if (mode !== 'cancelled' && mode !== 'empty-host') {
        expect(frames).toEqual(
          expect.arrayContaining([
            { type: 'event', sequence: 1, held: true },
            { type: 'event', sequence: 2, held: false }
          ])
        )
      }
      expect(JSON.stringify(frames)).not.toContain(secret)
      if (pairingSecret) {
        expect(JSON.stringify(frames)).not.toContain(pairingSecret)
      }
      await vi.waitFor(() => expect(disposals[0]).toHaveBeenCalledOnce())
      expect(getActiveRuntimeJsonEventStreamCount(runtime, 'structuredHeld')).toBe(0)
      if (mode === 'empty-host') {
        expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
      }
    } finally {
      await pending
      await server.stop()
      await stopStructuredAgentSessionRuntime()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
