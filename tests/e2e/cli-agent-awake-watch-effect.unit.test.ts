import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { AgentAwakeService } from '../../src/main/agent-awake-service'
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
  'missing-service',
  'no-subscribe',
  'invalid-request',
  'service-lost',
  'cancelled'
])('observes canonical awake state with host and lifetime boundaries: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-awake-watch-'))
  const blocker = { start: vi.fn(() => 1), stop: vi.fn(), isStarted: vi.fn(() => false) }
  const assertion = { start: () => false, stop: () => {}, dispose: () => {} }
  const service = new AgentAwakeService({
    blocker,
    linuxAssertion: assertion,
    macosAssertion: assertion,
    powerMonitor: null,
    platform: 'win32'
  })
  const disposals: ReturnType<typeof vi.fn>[] = []
  let available = true
  const runtime = new OrcaRuntimeService(null, undefined, {
    getAgentAwakeStatus: () =>
      mode === 'missing-service' || !available ? null : service.getStatus(),
    subscribeAgentAwakeChanges: (listener) => {
      if (mode === 'no-subscribe') {
        return null
      }
      const dispose = vi.fn(service.subscribe(listener))
      disposals.push(dispose)
      return dispose
    }
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
        name: 'fixture-awake-watch',
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
        JSON.stringify({ ...readMetadata(root), agentAwakeStreaming: undefined })
      )
    }
    const file = join(root, 'watch.json')
    await writeFile(
      file,
      JSON.stringify(mode === 'invalid-request' ? { watchMs: 0, unknown: true } : { watchMs: 1000 })
    )
    pending = main(['agent', 'awake', 'watch', '--request-file', file, '--json'], root)
    if (
      ['old-local', 'old-paired', 'missing-service', 'no-subscribe', 'invalid-request'].includes(
        mode
      )
    ) {
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
                    : 'agent_awake_unavailable'
          })
        })
      )
      expect(disposals).toHaveLength(0)
      expect(getActiveRuntimeJsonEventStreamCount(runtime, 'agentAwake')).toBe(0)
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
    } else if (mode === 'service-lost') {
      available = false
      service.setMode('auto')
    } else {
      service.setMode('auto')
      service.setMode('off')
    }
    await pending
    expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : mode === 'service-lost' ? 1 : 0)
    if (mode !== 'cancelled' && mode !== 'service-lost') {
      expect(frames).toEqual(
        expect.arrayContaining([
          { type: 'event', sequence: 1, status: { mode: 'auto', active: false } },
          { type: 'event', sequence: 2, status: { mode: 'off', active: false } }
        ])
      )
    }
    expect(JSON.stringify(frames)).not.toContain(secret)
    if (pairingSecret) {
      expect(JSON.stringify(frames)).not.toContain(pairingSecret)
    }
    expect(blocker.start).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(disposals[0]).toHaveBeenCalledOnce())
    expect(getActiveRuntimeJsonEventStreamCount(runtime, 'agentAwake')).toBe(0)
  } finally {
    await pending
    await server.stop()
    service.dispose()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
