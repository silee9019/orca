import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { createRuntime } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { createPtyIpcSession } from '../../src/main/ipc/pty/session'
import {
  requestDeliveryResyncForGatedPty,
  clearDeliveryResyncProbe
} from '../../src/main/ipc/pty/delivery/accounting'
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
  'wrong-runtime',
  'invalid-renderer',
  'other-renderer',
  'no-window',
  'destroyed-window',
  'send-failed',
  'cancelled'
])(
  'observes canonical renderer-global resync requests without changing delivery: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-renderer-resync-')),
      runtime = createRuntime(),
      window = renderer(mode === 'other-renderer' ? 422 : 421),
      session = createPtyIpcSession({
        runtime,
        ...(mode === 'no-window' ? {} : { mainWindow: window })
      })
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
      if (paired) {
        const offer = server.createPairingOffer({
          address: '127.0.0.1',
          name: 'isolated-renderer-resync',
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
          JSON.stringify({ ...readMetadata(root), rendererDeliveryResyncStreaming: undefined })
        )
      }
      const file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          expectedRuntimeId: mode === 'wrong-runtime' ? 'stale' : runtime.getRuntimeId(),
          executionHostId: 'local',
          expectedRendererId: mode === 'invalid-renderer' ? 0 : 421,
          watchMs: 400
        })
      )
      pending = main(['terminal', 'watch-delivery-resync', '--request-file', file, '--json'], root)
      if (['old-local', 'old-paired', 'wrong-runtime', 'invalid-renderer'].includes(mode)) {
        await pending
        expect(process.exitCode).toBe(1)
        expect(frames).not.toContainEqual(expect.objectContaining({ type: 'ready' }))
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
        if (mode === 'destroyed-window') {
          vi.spyOn(window, 'isDestroyed').mockReturnValue(true)
        }
        if (mode === 'send-failed') {
          window.webContents.send.mockImplementation(() => {
            throw new Error('Isolated renderer disposed')
          })
        }
        session.rendererInFlightTotalChars = 117
        session.rendererDeliveryAccountingByPty.set('fixture', {
          sentChars: 117,
          ackedChars: 0,
          lastSendAtMs: 1,
          lastAckAtMs: null
        })
        const blocked = ['no-window', 'destroyed-window'].includes(mode)
        const send = () => requestDeliveryResyncForGatedPty(session)
        if (mode === 'send-failed') {
          expect(send).toThrow('Isolated renderer disposed')
        } else {
          send()
        }
        const timer = session.deliveryResyncTimer
        expect(session.deliveryResyncOutstandingRequestId).toBe(blocked ? null : 1)
        send()
        expect(session.deliveryResyncTimer).toBe(timer)
        expect(window.webContents.send).toHaveBeenCalledTimes(blocked ? 0 : 1)
        clearDeliveryResyncProbe(session)
        if (mode === 'send-failed') {
          expect(send).toThrow('Isolated renderer disposed')
        } else {
          send()
        }
        expect(session.deliveryResyncOutstandingRequestId).toBe(blocked ? null : 2)
        expect(session.rendererInFlightTotalChars).toBe(117)
        expect(session.rendererDeliveryAccountingByPty.get('fixture')?.ackedChars).toBe(0)
        clearDeliveryResyncProbe(session)
      }
      await pending
      const events = frames.filter(
        (f) => typeof f === 'object' && f !== null && 'type' in f && f.type === 'event'
      )
      const expected = ['local', 'paired'].includes(mode) ? 2 : 0
      expect(events).toHaveLength(expected)
      if (expected) {
        expect(events).toEqual(
          [1, 2].map((requestId) =>
            expect.objectContaining({
              request: { kind: 'delivery-resync', rendererId: 421, requestId },
              rendererApplied: false
            })
          )
        )
      }
      expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : 0)
      await vi.waitFor(() => expect(getPtyControlRequestObserverCount(runtime)).toBe(0))
    } finally {
      clearDeliveryResyncProbe(session)
      await pending
      await server.stop()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
