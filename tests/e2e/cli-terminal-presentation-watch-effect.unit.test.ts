import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import {
  createRuntime,
  syncSinglePty,
  TEST_WORKTREE_ID
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'

it.each([
  'driver',
  'fit',
  'paired',
  'old-local',
  'old-paired',
  'cancelled',
  'gone',
  'replacement'
] as const)(
  'preserves canonical presentation streaming and cleanup through public CLI: %s',
  async (mode) => {
    const kind = mode === 'fit' ? 'fit' : 'driver'
    const { getActiveTerminalPresentationStreamCount } =
      await import('../../src/main/runtime/terminal-presentation-stream')
    const root = await mkdtemp(join(tmpdir(), 'orca-presentation-watch-'))
    const runtime = createRuntime(),
      id = 'fixture-presentation-stream',
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
      const originalOn = process.on
      vi.spyOn(process, 'on').mockImplementation((event, listener) => {
        if (event === 'SIGINT') {
          interrupt = () => listener()
          return process
        }
        return originalOn.call(process, event, listener)
      })
    }
    let pending: Promise<void> | undefined
    let otherSubscription: { close: () => void } | undefined
    const otherFrames: unknown[] = []
    try {
      await server.start()
      let pairingSecret: string | undefined
      if (paired) {
        const offer = server.createPairingOffer({
          address: '127.0.0.1',
          name: 'fixture-presentation-client',
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
          JSON.stringify({ ...readMetadata(root), terminalPresentationStreaming: undefined })
        )
      }
      const terminal = (await runtime.listTerminals()).terminals[0].handle
      const file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          terminal,
          expectedPtyId: id,
          expectedIncarnationId: incarnationId,
          expectedExecutionHostId: 'local',
          watchMs: 1000
        })
      )
      pending = main(['terminal', `watch-${kind}`, '--request-file', file, '--json'], root)
      if (mode === 'old-local' || mode === 'old-paired') {
        await pending
        expect(process.exitCode).toBe(1)
        expect(frames).toEqual([
          expect.objectContaining({
            ok: false,
            error: expect.objectContaining({
              code: mode === 'old-local' ? 'method_not_supported' : 'method_not_found'
            })
          })
        ])
        expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(0)
        return
      }
      await vi.waitFor(() =>
        expect(frames).toContainEqual(expect.objectContaining({ type: 'ready' }))
      )
      if (mode === 'cancelled') {
        otherSubscription = await new RuntimeClient(root).subscribeTerminalPresentation(
          {
            terminal,
            expectedPtyId: id,
            expectedIncarnationId: incarnationId,
            expectedExecutionHostId: 'local',
            kind: 'driver',
            subscriptionId: randomUUID()
          },
          {
            onResponse: (response) => {
              if (response.ok) {
                otherFrames.push(response.result)
              }
            },
            onError: () => {},
            onClose: () => {}
          },
          new AbortController().signal
        )
        await vi.waitFor(() => expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(2))
        if (!interrupt) {
          throw new Error('Fixture interrupt callback missing')
        }
        interrupt()
      } else if (mode === 'gone') {
        runtime.onPtyExit(id)
      } else if (mode === 'replacement') {
        runtime.registerPty(id, TEST_WORKTREE_ID, null, {
          tabId: 'tab-1',
          leafId: 'pane:1',
          incarnationId: 'replacement'
        })
        await runtime.handleMobileSubscribe(id, 'fixture-replacement-phone', { cols: 40, rows: 12 })
      } else {
        await runtime.handleMobileSubscribe(id, 'fixture-phone', { cols: 40, rows: 12 })
        if (kind === 'fit') {
          runtime.setMobileDisplayMode(id, 'desktop')
          await runtime.applyMobileDisplayMode(id)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 20))
          await runtime.handleMobileSubscribe(id, 'fixture-other-phone', { cols: 45, rows: 15 })
        }
      }
      await pending
      if (pairingSecret) {
        expect(JSON.stringify(frames)).not.toContain(pairingSecret)
      }
      const events = frames.filter(
        (frame) =>
          frame !== null && typeof frame === 'object' && 'type' in frame && frame.type === 'event'
      )
      expect(events).toHaveLength(['driver', 'fit', 'paired'].includes(mode) ? 2 : 0)
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
      if (mode === 'cancelled') {
        await vi.waitFor(() => expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(1))
        await runtime.handleMobileSubscribe(id, 'fixture-surviving-phone', { cols: 40, rows: 12 })
        await vi.waitFor(() =>
          expect(otherFrames).toContainEqual(
            expect.objectContaining({
              type: 'event',
              sequence: 1,
              value: { kind: 'mobile', clientId: 'fixture-surviving-phone' }
            })
          )
        )
        otherSubscription?.close()
      }
      await vi.waitFor(() => expect(getActiveTerminalPresentationStreamCount(runtime)).toBe(0))
    } finally {
      otherSubscription?.close()
      runtime.onPtyExit(id)
      await pending
      await server.stop()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
