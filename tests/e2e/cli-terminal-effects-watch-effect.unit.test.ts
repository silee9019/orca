import '../../src/main/runtime/orca-runtime-test-mocks.spec'
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

it.each([
  'local',
  'invalid',
  'paired',
  'old-local',
  'old-paired',
  'cancelled',
  'gone',
  'replacement',
  'wrong-host',
  'wrong-incarnation'
] as const)(
  'preserves canonical effects streaming and cleanup through public CLI: %s',
  async (mode) => {
    const { getActiveTerminalEffectsStreamCount } =
      await import('../../src/main/runtime/terminal-effects-stream')
    const root = await mkdtemp(join(tmpdir(), 'orca-effects-watch-'))
    const runtime = createRuntime(),
      id = 'fixture-effects-stream',
      incarnationId = 'fixture-stream-incarnation'
    runtime.setPtyController({
      write: () => true,
      kill: () => {},
      getForegroundProcess: async () => null,
      resize: () => true,
      getSize: () => ({ cols: 80, rows: 24 })
    })
    syncSinglePty(runtime, id)
    runtime.registerPty(id, TEST_WORKTREE_ID, null, {
      tabId: 'tab-1',
      leafId: 'pane:1',
      incarnationId
    })
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    const paired = mode === 'paired' || mode === 'old-paired'
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath: root,
      enableWebSocket: paired,
      wsPort: 0,
      pinnedBindHost: '127.0.0.1',
      ...(mode === 'old-paired'
        ? { methods: (await import('../../src/main/runtime/rpc/methods/status')).STATUS_METHODS }
        : {})
    })
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    const frames: unknown[] = []
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => {
      frames.push(JSON.parse(String(value)))
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let interrupt: (() => void) | undefined
    if (mode === 'cancelled') {
      const originalOn = process.on.bind(process)
      vi.spyOn(process, 'on').mockImplementation((event, listener) => {
        if (event === 'SIGINT') {
          interrupt = () => listener()
          return process
        }
        return originalOn(event, listener)
      })
    }
    let pending: Promise<void> | undefined
    try {
      await server.start()
      let pairingSecret: string | undefined
      if (paired) {
        const offer = server.createPairingOffer({
          address: '127.0.0.1',
          name: 'fixture-effects-client',
          scope: 'runtime'
        })
        if (!offer.available) {
          throw new Error('Fixture pairing unavailable')
        }
        pairingSecret = offer.pairingUrl
        vi.stubEnv('ORCA_PAIRING_CODE', pairingSecret)
        await rm(join(root, 'orca-runtime.json'))
      } else if (mode === 'old-local') {
        const { readMetadata } = await import('../../src/cli/runtime/metadata')
        await writeFile(
          join(root, 'orca-runtime.json'),
          JSON.stringify({ ...readMetadata(root), terminalEffectsStreaming: undefined })
        )
      }
      const terminal = (await runtime.listTerminals()).terminals[0].handle
      const file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          terminal,
          expectedPtyId: id,
          expectedIncarnationId: mode === 'wrong-incarnation' ? 'stale-incarnation' : incarnationId,
          expectedExecutionHostId: mode === 'wrong-host' ? 'ssh:fixture-other' : 'local',
          includeContent: mode !== 'invalid',
          watchMs: 500
        })
      )
      pending = main(['terminal', 'watch-effects', '--request-file', file, '--json'], root)
      if (mode === 'old-local' || mode === 'old-paired' || mode === 'invalid') {
        await pending
        expect(process.exitCode).toBe(1)
        expect(frames).toEqual([
          expect.objectContaining({
            ok: false,
            error: expect.objectContaining({
              code:
                mode === 'invalid'
                  ? 'invalid_argument'
                  : mode === 'old-local'
                    ? 'method_not_supported'
                    : 'method_not_found'
            })
          })
        ])
        expect(getActiveTerminalEffectsStreamCount(runtime)).toBe(0)
        return
      }
      if (mode === 'wrong-host' || mode === 'wrong-incarnation') {
        await pending
        expect(process.exitCode).toBe(1)
        expect(frames).not.toContainEqual(expect.objectContaining({ type: 'ready' }))
        expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
        expect(getActiveTerminalEffectsStreamCount(runtime)).toBe(0)
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
      } else if (mode === 'gone') {
        await runtime.onPtyExit(id)
      } else {
        if (mode === 'replacement') {
          runtime.registerPty(id, TEST_WORKTREE_ID, null, {
            tabId: 'tab-1',
            leafId: 'pane:1',
            incarnationId: 'replacement'
          })
        }
        runtime.onPtyData('not-selected', '\x07', 10)
        runtime.onPtyData(id, '\x1b]0;fixture title\x07\x07', 20)
        runtime.onPtyData(id, '\x1b[?2031h', 30)
        runtime.onPtyData(id, '\x1b]0;fixture title\x07', 40)
      }
      await pending
      if (pairingSecret) {
        expect(JSON.stringify(frames)).not.toContain(pairingSecret)
      }
      const events = frames.filter(
        (frame) =>
          frame !== null && typeof frame === 'object' && 'type' in frame && frame.type === 'event'
      )
      expect(events).toHaveLength(['local', 'paired'].includes(mode) ? 2 : 0)
      if (events.length) {
        expect(events[0]).toEqual(
          expect.objectContaining({
            batch: expect.objectContaining({
              ptyId: id,
              facts: [
                { kind: 'title', rawTitle: 'fixture title', normalizedTitle: 'fixture title' },
                { kind: 'bell' }
              ]
            })
          })
        )
        expect(events[1]).toEqual(
          expect.objectContaining({
            batch: expect.objectContaining({ facts: [{ kind: '2031-subscribe' }] })
          })
        )
      }
      if (mode === 'gone') {
        expect(frames).toContainEqual({ type: 'end', sequence: 0 })
        expect(frames).toContainEqual(
          expect.objectContaining({
            type: 'watch-ended',
            reason: 'host-end',
            eventsComplete: false
          })
        )
      }
      expect(process.exitCode ?? 0).toBe(
        mode === 'cancelled' ? 130 : mode === 'replacement' ? 1 : 0
      )
      await vi.waitFor(() => expect(getActiveTerminalEffectsStreamCount(runtime)).toBe(0))
    } finally {
      await runtime.onPtyExit(id)
      await pending
      await server.stop()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
