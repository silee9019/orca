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
import { createPtyIpcSession } from '../../src/main/ipc/pty/session'
import { sendPtyDataToRenderer } from '../../src/main/ipc/pty/delivery/payload'
import { readMetadata } from '../../src/cli/runtime/metadata'
import { getPtyControlRequestObserverCount } from '../../src/main/runtime/pty-control-request-observers'
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
  'local',
  'paired',
  'old-local',
  'old-paired',
  'private-refused',
  'wrong-host',
  'wrong-incarnation',
  'other-renderer',
  'no-window',
  'send-failed',
  'cancelled',
  'replacement',
  'gone'
])('observes only renderer-bound data for one pinned owner: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-renderer-data-')),
    runtime = createRuntime(),
    id = 'fixture-renderer-data',
    incarnationId = 'fixture-incarnation',
    window = renderer(mode === 'other-renderer' ? 422 : 421),
    session = createPtyIpcSession({
      runtime,
      ...(mode === 'no-window' ? {} : { mainWindow: window })
    })
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
    frames.push(JSON.parse(String(v)))
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
    if (paired) {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'isolated-renderer-data',
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
        JSON.stringify({ ...readMetadata(root), terminalRendererDataStreaming: undefined })
      )
    }
    const terminal = (await runtime.listTerminals()).terminals[0].handle,
      file = join(root, 'request.json')
    await writeFile(
      file,
      JSON.stringify({
        terminal,
        expectedPtyId: id,
        expectedIncarnationId: mode === 'wrong-incarnation' ? 'stale' : incarnationId,
        expectedExecutionHostId: mode === 'wrong-host' ? 'ssh:other' : 'local',
        expectedRendererId: 421,
        includeContent: mode !== 'private-refused',
        watchMs: 400
      })
    )
    pending = main(['terminal', 'watch-renderer-data', '--request-file', file, '--json'], root)
    if (
      ['old-local', 'old-paired', 'private-refused', 'wrong-host', 'wrong-incarnation'].includes(
        mode
      )
    ) {
      await pending
      expect(process.exitCode).toBe(1)
      expect(frames).not.toContainEqual(expect.objectContaining({ type: 'ready' }))
      expect(JSON.stringify(frames)).not.toContain('private renderer data')
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
      if (mode === 'send-failed') {
        window.webContents.send.mockImplementation(() => {
          throw new Error('Isolated renderer disposed')
        })
      }
      const payload = {
        id,
        data: 'private renderer data\x1b[31m한글',
        seq: 317,
        rawLength: 117,
        transformed: true,
        background: true
      }
      expect(
        sendPtyDataToRenderer(session, 'unrelated', {
          id: 'unrelated',
          data: 'private foreign data'
        }).sent
      ).toBe(!['no-window', 'send-failed'].includes(mode))
      expect(sendPtyDataToRenderer(session, id, payload).sent).toBe(
        !['no-window', 'send-failed'].includes(mode)
      )
      if (mode === 'send-failed') {
        expect(session.rendererDeliveryRestoreNeededPtys.has(id)).toBe(true)
      }
      expect(session.rendererDeliveryAccountingByPty.get(id)?.ackedChars ?? 0).toBe(0)
      expect(window.webContents.send).toHaveBeenCalledTimes(mode === 'no-window' ? 0 : 2)
    }
    await pending
    const events = frames.filter(
        (f) => typeof f === 'object' && f !== null && 'type' in f && f.type === 'event'
      ),
      expected = ['local', 'paired'].includes(mode) ? 1 : 0
    expect(events).toHaveLength(expected)
    if (expected) {
      expect(events).toEqual([
        expect.objectContaining({
          request: {
            kind: 'renderer-data',
            ptyId: id,
            rendererId: 421,
            origin: 'pty-output',
            payload: {
              id,
              data: 'private renderer data\x1b[31m한글',
              seq: 317,
              rawLength: 117,
              transformed: true,
              background: true
            }
          },
          rendererApplied: false
        })
      ])
    }
    expect(JSON.stringify(frames)).not.toContain('private foreign data')
    expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : mode === 'replacement' ? 1 : 0)
    await vi.waitFor(() => expect(getPtyControlRequestObserverCount(runtime)).toBe(0))
  } finally {
    await pending
    await server.stop()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
