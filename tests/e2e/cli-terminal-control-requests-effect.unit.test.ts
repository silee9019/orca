import { sendModelRestoreNeededMarker } from '../../src/main/ipc/pty/delivery/payload'
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
import {
  clearBufferFromRuntimeController,
  resetInputModesFromRuntimeController
} from '../../src/main/ipc/pty/runtime/operations'
import { createPtyIpcSession } from '../../src/main/ipc/pty/session'
import {
  requestSerializedBuffer,
  settleSerializeRequest
} from '../../src/main/ipc/pty/ipc/serialize-buffer'
import * as providers from '../../src/main/ipc/pty/provider/registry'
import { readMetadata } from '../../src/cli/runtime/metadata'
function renderer(id: number) {
  return {
    isDestroyed: () => false,
    isFocused: () => false,
    isVisible: () => false,
    isMinimized: () => false,
    webContents: {
      id,
      isDestroyed: () => false,
      send: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn()
    }
  }
}
it.each([
  'model-local',
  'model-paired',
  'model-old-local',
  'model-old-paired',
  'model-invalid-renderer',
  'model-cancelled',
  'model-gone',
  'model-replacement',
  'model-wrong-host',
  'model-wrong-incarnation',
  'model-other-renderer',
  'model-no-window',
  'model-send-failed',
  'model-destroyed-window',
  'local',
  'paired',
  'old-local',
  'old-paired',
  'invalid-renderer',
  'cancelled',
  'gone',
  'replacement',
  'wrong-host',
  'wrong-incarnation',
  'other-renderer',
  'no-window',
  'serialize-timeout'
])('observes only canonical requests addressed to a pinned renderer and PTY: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-control-watch-')),
    runtime = createRuntime(),
    id = 'fixture-control-stream',
    incarnationId = 'fixture-control-incarnation',
    window = renderer(421)
  const { getPtyControlRequestObserverCount: count } =
    await import('../../src/main/runtime/pty-control-request-observers')
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
  vi.spyOn(providers, 'getProviderForPty').mockImplementation(() => {
    throw new Error('Isolated fixture provider unavailable')
  })
  const model = mode.startsWith('model-'),
    variant = mode.replace(/^model-/, ''),
    paired = variant === 'paired' || variant === 'old-paired' || variant === 'model-paired',
    server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath: root,
      enableWebSocket: paired,
      wsPort: 0,
      pinnedBindHost: '127.0.0.1',
      ...(variant === 'old-paired'
        ? { methods: (await import('../../src/main/runtime/rpc/methods/status')).STATUS_METHODS }
        : {})
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
  if (variant === 'cancelled') {
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
    if (paired) {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'isolated-control-watch',
        scope: 'runtime'
      })
      if (!offer.available) {
        throw new Error('Fixture pairing unavailable')
      }
      vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
      await rm(join(root, 'orca-runtime.json'))
    } else if (variant === 'old-local') {
      await writeFile(
        join(root, 'orca-runtime.json'),
        JSON.stringify({
          ...readMetadata(root),
          terminalControlStreaming: undefined,
          terminalModelRestoreStreaming: undefined
        })
      )
    }
    const terminal = (await runtime.listTerminals()).terminals[0].handle,
      file = join(root, 'request.json')
    await writeFile(
      file,
      JSON.stringify({
        terminal,
        expectedPtyId: id,
        expectedIncarnationId: variant === 'wrong-incarnation' ? 'stale' : incarnationId,
        expectedExecutionHostId: variant === 'wrong-host' ? 'ssh:other' : 'local',
        expectedRendererId: variant === 'invalid-renderer' ? 0 : 421,
        watchMs: variant === 'serialize-timeout' ? 1200 : 500
      })
    )
    pending = main(
      [
        'terminal',
        model ? 'watch-model-restore' : 'watch-control-requests',
        '--request-file',
        file,
        '--json'
      ],
      root
    )
    if (
      ['old-local', 'old-paired', 'invalid-renderer', 'wrong-host', 'wrong-incarnation'].includes(
        variant
      )
    ) {
      await pending
      expect(process.exitCode).toBe(1)
      expect(frames).not.toContainEqual(expect.objectContaining({ type: 'ready' }))
      if (variant.startsWith('old')) {
        expect(frames).toContainEqual(
          expect.objectContaining({
            ok: false,
            error: expect.objectContaining({
              code: variant === 'old-local' ? 'method_not_supported' : 'method_not_found'
            })
          })
        )
      }
      return
    }
    await vi.waitFor(() =>
      expect(frames).toContainEqual(expect.objectContaining({ type: 'ready' }))
    )
    if (variant === 'cancelled') {
      if (!interrupt) {
        throw new Error('Fixture interrupt missing')
      }
      interrupt()
    } else if (variant === 'gone') {
      await runtime.onPtyExit(id)
    } else {
      if (variant === 'replacement') {
        runtime.registerPty(id, TEST_WORKTREE_ID, null, {
          tabId: 'tab-1',
          leafId: 'pane:1',
          incarnationId: 'replacement'
        })
      }
      const selected = variant === 'other-renderer' ? renderer(422) : window,
        deps = { runtime, ...(variant === 'no-window' ? {} : { mainWindow: selected }) }
      await clearBufferFromRuntimeController(deps, 'unrelated-pty')
      await clearBufferFromRuntimeController(deps, id)
      await resetInputModesFromRuntimeController(deps, id)
      const session = createPtyIpcSession(deps),
        serialization = requestSerializedBuffer(session, id, { scrollbackRows: 17 })
      if (mode !== 'serialize-timeout') {
        for (const key of session.pendingSerializeRequests.keys()) {
          settleSerializeRequest(session, key, null)
        }
      }
      if (variant === 'send-failed') {
        selected.webContents.send.mockImplementation(() => {
          throw new Error('Disposed isolated renderer')
        })
      }
      if (variant === 'destroyed-window') {
        vi.spyOn(selected, 'isDestroyed').mockReturnValue(true)
      }
      const markerSent = !['no-window', 'send-failed', 'destroyed-window'].includes(variant)
      expect(sendModelRestoreNeededMarker(session, 'unrelated-pty', 'hidden-drop', 15)).toBe(
        markerSent
      )
      expect(sendModelRestoreNeededMarker(session, id, 'delivery-heal', 17)).toBe(markerSent)
      expect(sendModelRestoreNeededMarker(session, id, 'unhide', undefined)).toBe(markerSent)
      expect(selected.webContents.send).toHaveBeenCalledTimes(
        variant === 'no-window' ? 0 : variant === 'destroyed-window' ? 4 : 7
      )
      expect(providers.getProviderForPty).toHaveBeenCalledTimes(3)
      expect(await serialization).toBeNull()
      expect(session.pendingSerializeRequests.size).toBe(0)
    }
    await pending
    const events = frames.filter(
      (frame) =>
        typeof frame === 'object' && frame !== null && 'type' in frame && frame.type === 'event'
    )
    const expected = [
      'cancelled',
      'gone',
      'replacement',
      'other-renderer',
      'no-window',
      'send-failed',
      'destroyed-window'
    ].includes(variant)
      ? 0
      : model
        ? 2
        : 3
    expect(events).toHaveLength(expected)
    if (expected && model) {
      expect(events).toEqual([
        expect.objectContaining({
          request: {
            kind: 'model-restore-needed',
            ptyId: id,
            rendererId: 421,
            reason: 'delivery-heal',
            markerSeq: 17
          },
          rendererApplied: false
        }),
        expect.objectContaining({
          request: { kind: 'model-restore-needed', ptyId: id, rendererId: 421, reason: 'unhide' },
          rendererApplied: false
        })
      ])
    } else if (expected) {
      expect(events).toEqual([
        expect.objectContaining({
          request: expect.objectContaining({ kind: 'clear-buffer', ptyId: id, rendererId: 421 })
        }),
        expect.objectContaining({
          request: expect.objectContaining({
            kind: 'reset-input-modes',
            ptyId: id,
            rendererId: 421
          })
        }),
        expect.objectContaining({
          request: expect.objectContaining({
            kind: 'serialize-buffer',
            ptyId: id,
            rendererId: 421,
            opts: { scrollbackRows: 17 }
          })
        })
      ])
    }
    expect(process.exitCode ?? 0).toBe(
      variant === 'cancelled' ? 130 : variant === 'replacement' ? 1 : 0
    )
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
