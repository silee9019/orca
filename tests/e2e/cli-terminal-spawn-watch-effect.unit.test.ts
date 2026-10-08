import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { createRuntime } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { readMetadata } from '../../src/cli/runtime/metadata'
import { STATUS_METHODS } from '../../src/main/runtime/rpc/methods/status'

it.each([
  'local',
  'paired',
  'old-local',
  'old-paired',
  'invalid',
  'duplicates',
  'cancelled',
  'unknown-incarnation',
  'all-host-ptys'
])('observes scoped canonical PTY spawn announcements: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-spawn-watch-'))
  const runtime = createRuntime()
  const { getPtySpawnObserverCount: count } =
    await import('../../src/main/runtime/pty-spawn-observers')
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
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  const frames: unknown[] = []
  vi.spyOn(console, 'log').mockImplementation((value) => {
    frames.push(JSON.parse(String(value)))
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let interrupt: (() => void) | undefined
  if (mode === 'cancelled') {
    const original = process.on.bind(process)
    vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      if (event === 'SIGINT') {
        interrupt = () => listener()
        return process
      }
      return original(event, listener)
    })
  }
  let pending: Promise<void> | undefined
  try {
    await server.start()
    const secret = readMetadata(root).authToken
    if (paired) {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'isolated-spawn-observer',
        scope: 'runtime'
      })
      if (!offer.available) {
        throw new Error('Fixture pairing unavailable')
      }
      vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
      await rm(join(root, 'orca-runtime.json'))
    } else if (mode === 'old-local') {
      await writeFile(
        join(root, 'orca-runtime.json'),
        JSON.stringify({ ...readMetadata(root), terminalSpawnStreaming: undefined })
      )
    }
    const file = join(root, 'watch.json')
    await writeFile(
      file,
      JSON.stringify({
        executionHostIds:
          mode === 'invalid'
            ? ['runtime:other']
            : mode === 'duplicates'
              ? ['local', 'local']
              : ['local', 'ssh:fixture'],
        ptyIds: mode === 'all-host-ptys' ? [] : ['new-local', 'ssh:fixture@@new-remote'],
        watchMs: 500
      })
    )
    pending = main(['terminal', 'watch-spawned', '--request-file', file, '--json'], root)
    if (['old-local', 'old-paired', 'invalid', 'duplicates'].includes(mode)) {
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
                  : 'invalid_argument'
          })
        })
      )
      expect(count(runtime)).toBe(0)
      return
    }
    await vi.waitFor(() =>
      expect(frames).toContainEqual(expect.objectContaining({ type: 'ready' }))
    )
    if (mode === 'cancelled') {
      if (!interrupt) {
        throw new Error('Fixture interrupt missing')
      }
      interrupt()
    } else {
      runtime.onPtySpawned('other-local', 'other')
      runtime.onPtySpawned('ssh:other@@new-remote', 'other')
      runtime.onPtySpawned('ssh:malformed', 'other')
      runtime.onPtySpawned(
        'new-local',
        mode === 'unknown-incarnation' ? undefined : 'first-incarnation'
      )
      runtime.onPtySpawned('ssh:fixture@@new-remote', 'remote-incarnation', {
        awaitsRegistration: false
      })
    }
    await pending
    expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : 0)
    const events = frames.filter(
      (frame) =>
        typeof frame === 'object' && frame !== null && 'type' in frame && frame.type === 'event'
    )
    expect(events).toHaveLength(mode === 'cancelled' ? 0 : mode === 'all-host-ptys' ? 3 : 2)
    if (mode === 'all-host-ptys') {
      events.shift()
    }
    if (events.length) {
      expect(events[0]).toEqual(
        expect.objectContaining({
          announcement: {
            ptyId: 'new-local',
            executionHostId: 'local',
            awaitsRegistration: true,
            ...(mode === 'unknown-incarnation' ? {} : { incarnationId: 'first-incarnation' })
          }
        })
      )
      expect(events[1]).toEqual(
        expect.objectContaining({
          announcement: {
            ptyId: 'ssh:fixture@@new-remote',
            executionHostId: 'ssh:fixture',
            awaitsRegistration: false,
            incarnationId: 'remote-incarnation'
          }
        })
      )
    }
    expect(JSON.stringify(frames)).not.toContain(secret)
    await vi.waitFor(() => expect(count(runtime)).toBe(0))
  } finally {
    await pending
    await server.stop()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
