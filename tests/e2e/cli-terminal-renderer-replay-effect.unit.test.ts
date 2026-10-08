import {
  createReplaySessionFixture,
  getReplayFixture
} from './terminal-renderer-replay-session-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import {
  createRuntime,
  syncSinglePty,
  TEST_WORKTREE_ID
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { readMetadata } from '../../src/cli/runtime/metadata'
const replayFixture = getReplayFixture()
it.each([
  'local',
  'paired',
  'old-local',
  'old-paired',
  'private-refused',
  'other-renderer',
  'no-window',
  'send-failed',
  'stale-generation',
  'reattach'
])(
  'observes only replay sent by the current SSH session to a pinned renderer: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-renderer-replay-')),
      runtime = createRuntime(),
      targetId = 'fixture-host',
      id = `ssh:${targetId}@@pty-1`,
      incarnationId = 'fixture-incarnation'
    runtime.setPtyController({
      write: () => true,
      kill: () => {},
      getForegroundProcess: async () => null,
      resize: () => true,
      getSize: () => ({ cols: 80, rows: 24 })
    })
    syncSinglePty(runtime, id)
    runtime.registerPty(id, TEST_WORKTREE_ID, targetId, {
      tabId: 'tab-1',
      leafId: 'pane:1',
      incarnationId
    })
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    const paired = mode === 'paired' || mode === 'old-paired',
      server = new OrcaRuntimeRpcServer({
        runtime,
        userDataPath: root,
        enableWebSocket: paired,
        wsPort: 0,
        pinnedBindHost: '127.0.0.1',
        ...(mode === 'old-paired'
          ? { methods: (await import('../../src/main/runtime/rpc/methods/status')).STATUS_METHODS }
          : {})
      })
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    const frames: unknown[] = []
    vi.spyOn(console, 'log').mockImplementation((v) => {
      if (typeof v === 'string' && v.startsWith('{')) {
        frames.push(JSON.parse(v))
      }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    replayFixture.ids.mockReturnValue([])
    replayFixture.attach.mockResolvedValue({})
    replayFixture.generation.mockReturnValue(23)
    let fixture: Awaited<ReturnType<typeof createReplaySessionFixture>> | undefined
    let pending: Promise<void> | undefined
    try {
      await server.start()
      fixture = await createReplaySessionFixture(
        runtime,
        targetId,
        mode === 'other-renderer' ? 422 : 421
      )
      if (paired) {
        const offer = server.createPairingOffer({
          address: '127.0.0.1',
          name: 'isolated-renderer-replay',
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
          JSON.stringify({ ...readMetadata(root), terminalRendererReplayStreaming: undefined })
        )
      }
      const terminal = (await runtime.listTerminals()).terminals[0].handle,
        file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          terminal,
          expectedPtyId: id,
          expectedIncarnationId: incarnationId,
          expectedExecutionHostId: `ssh:${targetId}`,
          expectedRendererId: 421,
          includeContent: mode !== 'private-refused',
          watchMs: 600
        })
      )
      pending = main(['terminal', 'watch-renderer-replay', '--request-file', file, '--json'], root)
      if (['old-local', 'old-paired', 'private-refused'].includes(mode)) {
        await pending
        expect(process.exitCode).toBe(1)
        expect(frames).not.toContainEqual(expect.objectContaining({ type: 'ready' }))
        return
      }
      await vi.waitFor(() =>
        expect(frames).toContainEqual(expect.objectContaining({ type: 'ready' }))
      )
      const { providerReplay } = fixture
      if (mode === 'no-window') {
        fixture.deps.getMainWindow.mockReturnValue(null)
      }
      if (mode === 'send-failed') {
        vi.spyOn(fixture.deps.mockWindow.webContents, 'send').mockImplementation(() => {
          throw new Error('Isolated replay renderer disposed')
        })
      }
      if (mode === 'stale-generation' || mode === 'reattach') {
        if (mode === 'reattach') {
          replayFixture.ids.mockReturnValue([id])
          replayFixture.attach.mockResolvedValue({
            replay: 'private reattach replay',
            incarnationId
          })
        }
        replayFixture.generation.mockReturnValue(24)
        await fixture.session.reconnect(fixture.deps.mockConn)
        if (mode === 'stale-generation') {
          providerReplay({ id, data: 'private stale replay' })
        }
      } else if (mode === 'send-failed') {
        expect(() => providerReplay({ id, data: 'private failed replay' })).toThrow(
          'Isolated replay renderer disposed'
        )
      } else {
        providerReplay({ id: 'ssh:fixture-host@@other', data: 'private foreign replay' })
        providerReplay({ id, data: 'private provider replay 한글' })
      }
      await pending
      const events = frames.filter(
          (f) => typeof f === 'object' && f !== null && 'type' in f && f.type === 'event'
        ),
        expected = ['local', 'paired', 'reattach'].includes(mode) ? 1 : 0
      expect(events).toHaveLength(expected)
      if (expected) {
        const origin = mode === 'reattach' ? 'reattach-replay' : 'provider-replay',
          data = mode === 'reattach' ? 'private reattach replay' : 'private provider replay 한글'
        expect(events).toEqual([
          expect.objectContaining({
            request: {
              kind: 'renderer-replay',
              ptyId: id,
              rendererId: 421,
              origin,
              payload: { id, data }
            },
            rendererApplied: false
          })
        ])
      }
      expect(JSON.stringify(frames)).not.toContain('private foreign replay')
      expect(JSON.stringify(frames)).not.toContain('private stale replay')
      expect(JSON.stringify(frames)).not.toContain('private failed replay')
      expect(process.exitCode ?? 0).toBe(0)
    } finally {
      await pending
      fixture?.session.dispose()
      await server.stop()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      replayFixture.replay.mockClear()
      replayFixture.ids.mockReturnValue([])
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
