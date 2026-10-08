import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { agentHookServer, _internals } from '../../src/main/agent-hooks/server'
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
  'duplicates',
  'disconnect',
  'no-disconnect',
  'cancelled'
])(
  'observes canonical status set and clear changes with host and lifetime boundaries: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-status-watch-'))
    _internals.resetCachesForTests()
    const paneKey = `watch-${mode}:11111111-1111-4111-8111-111111111111`
    const otherPane = `other-${mode}:22222222-2222-4222-8222-222222222222`
    const disposals: ReturnType<typeof vi.fn>[] = []
    const subscribe = agentHookServer.subscribeEnrichedStatus.bind(agentHookServer)
    vi.spyOn(agentHookServer, 'subscribeEnrichedStatus').mockImplementation((listener) => {
      const dispose = vi.fn(subscribe(listener))
      disposals.push(dispose)
      return dispose
    })
    const subscribeClear = agentHookServer.subscribePaneStatusClear.bind(agentHookServer)
    vi.spyOn(agentHookServer, 'subscribePaneStatusClear').mockImplementation((listener) => {
      const dispose = vi.fn(subscribeClear(listener))
      disposals.push(dispose)
      return dispose
    })
    const seed = (paneKey: string, state: 'working' | 'waiting') =>
      agentHookServer.ingestRemote(
        {
          paneKey,
          tabId: paneKey.split(':')[0],
          worktreeId: 'folder:fixture',
          source: 'claude',
          launchToken: 'private-launch-canary',
          providerSession: { key: 'session_id', id: 'private-resume-canary' },
          payload: {
            state,
            agentType: 'claude',
            prompt: 'private-prompt-canary',
            mainAgent: { state, stateStartedAt: 1 }
          }
        },
        'fixture-ssh'
      )
    seed(paneKey, 'working')
    const runtime = new OrcaRuntimeService(null)
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
          name: 'fixture-status-watch',
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
          JSON.stringify({ ...readMetadata(root), agentStatusStreaming: undefined })
        )
      }
      const file = join(root, 'watch.json')
      await writeFile(
        file,
        JSON.stringify(
          mode === 'invalid-request'
            ? { watchMs: 0, unknown: true }
            : {
                watchMs: 1000,
                paneKeys: mode === 'duplicates' ? [paneKey, paneKey] : [paneKey],
                connectionIds: mode === 'no-disconnect' ? [] : ['fixture-ssh']
              }
        )
      )
      pending = main(['agent', 'status', 'watch', '--request-file', file, '--json'], root)
      if (['old-local', 'old-paired', 'invalid-request', 'duplicates'].includes(mode)) {
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
        expect(getActiveRuntimeJsonEventStreamCount(runtime, 'agentStatus')).toBe(0)
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
        seed(otherPane, 'working')
        seed(paneKey, 'waiting')
        seed(paneKey, 'working')
        if (mode === 'disconnect' || mode === 'no-disconnect') {
          agentHookServer.clearStatusEntriesForConnection('fixture-ssh')
        } else {
          agentHookServer.dropStatusEntriesByTabPrefix(`watch-${mode}`)
        }
      }
      await pending
      expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : 0)
      if (mode !== 'cancelled') {
        const changes = frames.filter(
          (frame) =>
            typeof frame === 'object' && frame !== null && 'type' in frame && frame.type === 'event'
        )
        expect(changes).toHaveLength(mode === 'no-disconnect' ? 2 : 3)
        expect(changes[0]).toMatchObject({
          type: 'event',
          sequence: 1,
          kind: 'set',
          status: { paneKey, state: 'waiting' }
        })
        expect(changes[1]).toMatchObject({
          type: 'event',
          sequence: 2,
          kind: 'set',
          status: { paneKey, state: 'working' }
        })
        if (mode !== 'no-disconnect') {
          expect(changes[2]).toMatchObject(
            mode === 'disconnect'
              ? { kind: 'clear', clear: { transient: true, connectionId: 'fixture-ssh' } }
              : { kind: 'clear', clear: { paneKey } }
          )
        }
      }
      for (const privateValue of [
        'private-launch-canary',
        'private-resume-canary',
        'private-prompt-canary',
        otherPane
      ]) {
        expect(JSON.stringify(frames)).not.toContain(privateValue)
      }
      expect(JSON.stringify(frames)).not.toContain(secret)
      if (pairingSecret) {
        expect(JSON.stringify(frames)).not.toContain(pairingSecret)
      }
      await vi.waitFor(() => {
        expect(disposals).toHaveLength(2)
        for (const dispose of disposals) {
          expect(dispose).toHaveBeenCalledOnce()
        }
      })
      expect(getActiveRuntimeJsonEventStreamCount(runtime, 'agentStatus')).toBe(0)
    } finally {
      await pending
      await server.stop()
      _internals.resetCachesForTests()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
