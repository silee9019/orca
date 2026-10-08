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
  'ssh-unverifiable',
  'ssh-confirmed',
  'signaled',
  'already-exited',
  'stale-exit',
  'provider-negative',
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
  'preserves canonical exit streaming and cleanup through public CLI: %s',
  async (mode) => {
    const { getActiveTerminalExitStreamCount } =
      await import('../../src/main/runtime/terminal-exit-stream')
    const root = await mkdtemp(join(tmpdir(), 'orca-exit-watch-'))
    const runtime = createRuntime(),
      id = mode.startsWith('ssh-') ? 'ssh:ssh-fixture@@fixture-exit' : 'fixture-exit-stream',
      incarnationId = 'fixture-stream-incarnation'
    runtime.setPtyController({
      write: () => true,
      kill: () => {},
      getForegroundProcess: async () => null,
      resize: () => true,
      getSize: () => ({ cols: 80, rows: 24 })
    })
    syncSinglePty(runtime, id)
    runtime.registerPty(id, TEST_WORKTREE_ID, mode.startsWith('ssh-') ? 'ssh-fixture' : null, {
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
          name: 'fixture-exit-client',
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
          JSON.stringify({ ...readMetadata(root), terminalExitStreaming: undefined })
        )
      }
      const terminal = (await runtime.listTerminals()).terminals[0].handle
      const file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          terminal,
          expectedPtyId: id,
          expectedIncarnationId:
            mode === 'invalid'
              ? ''
              : mode === 'wrong-incarnation'
                ? 'stale-incarnation'
                : incarnationId,
          expectedExecutionHostId:
            mode === 'wrong-host'
              ? 'ssh:fixture-other'
              : mode.startsWith('ssh-')
                ? 'ssh:ssh-fixture'
                : 'local',
          watchMs: 500
        })
      )
      if (mode === 'already-exited') {
        await runtime.onPtyExit(id, 0, incarnationId)
      }
      pending = main(['terminal', 'watch-exit', '--request-file', file, '--json'], root)
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
        expect(getActiveTerminalExitStreamCount(runtime)).toBe(0)
        return
      }
      if (mode === 'wrong-host' || mode === 'wrong-incarnation' || mode === 'already-exited') {
        await pending
        expect(process.exitCode).toBe(1)
        expect(frames).not.toContainEqual(expect.objectContaining({ type: 'ready' }))
        expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
        expect(getActiveTerminalExitStreamCount(runtime)).toBe(0)
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
        if (mode === 'replacement') {
          runtime.registerPty(id, TEST_WORKTREE_ID, null, {
            tabId: 'tab-1',
            leafId: 'pane:1',
            incarnationId: 'replacement'
          })
        }
        await runtime.onPtyExit(
          id,
          mode.startsWith('ssh-') || mode === 'provider-negative'
            ? -1
            : mode === 'signaled'
              ? 143
              : 0,
          mode === 'stale-exit'
            ? 'stale-exit-incarnation'
            : mode === 'replacement'
              ? 'replacement'
              : incarnationId,
          {
            providerExitObserved: mode === 'provider-negative',
            hostExitConfirmed: mode === 'ssh-confirmed',
            ...(mode === 'signaled' ? { cause: { kind: 'signaled' as const, signal: 15 } } : {})
          }
        )
      }
      await pending
      if (pairingSecret) {
        expect(JSON.stringify(frames)).not.toContain(pairingSecret)
      }
      const events = frames.filter(
        (frame) =>
          frame !== null && typeof frame === 'object' && 'type' in frame && frame.type === 'event'
      )
      expect(events).toHaveLength(
        [
          'local',
          'paired',
          'gone',
          'ssh-unverifiable',
          'ssh-confirmed',
          'signaled',
          'provider-negative'
        ].includes(mode)
          ? 1
          : 0
      )
      if (mode === 'signaled') {
        expect(events[0]).toEqual(
          expect.objectContaining({
            observation: expect.objectContaining({ cause: { kind: 'signaled', signal: 15 } })
          })
        )
      }
      if (events.length) {
        expect(events[0]).toEqual(
          expect.objectContaining({
            observation: expect.objectContaining({
              ptyId: id,
              code:
                mode.startsWith('ssh-') || mode === 'provider-negative'
                  ? -1
                  : mode === 'signaled'
                    ? 143
                    : 0,
              verdict: expect.objectContaining({
                status: mode === 'ssh-unverifiable' ? 'unverifiable' : 'exited'
              })
            })
          })
        )
        expect(frames).toContainEqual({ type: 'end', sequence: 1 })
      }
      expect(process.exitCode ?? 0).toBe(
        mode === 'cancelled' ? 130 : mode === 'replacement' ? 1 : 0
      )
      await vi.waitFor(() => expect(getActiveTerminalExitStreamCount(runtime)).toBe(0))
    } finally {
      await runtime.onPtyExit(id, 0)
      await pending
      await server.stop()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
