import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { createRuntime } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
it.each(['local', 'paired', 'unavailable', 'wrong-runtime', 'old-host'])(
  'queries listener count through the selected runtime: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-listener-count-')),
      runtime = createRuntime()
    const read = vi.spyOn(runtime, 'readPtyDataListenerCount')
    if (mode !== 'unavailable') {
      read.mockResolvedValue(2)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    const frames: unknown[] = []
    vi.spyOn(console, 'log').mockImplementation((value) => {
      if (typeof value === 'string' && value.startsWith('{')) {
        frames.push(JSON.parse(value))
      }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath: root,
      enableWebSocket: mode === 'paired',
      wsPort: 0,
      pinnedBindHost: '127.0.0.1',
      ...(mode === 'old-host'
        ? { methods: (await import('../../src/main/runtime/rpc/methods/status')).STATUS_METHODS }
        : {})
    })
    try {
      await server.start()
      if (mode === 'paired') {
        const offer = server.createPairingOffer({
          address: '127.0.0.1',
          name: 'isolated-listener-count',
          scope: 'runtime'
        })
        if (!offer.available) {
          throw new Error('Fixture pairing unavailable')
        }
        vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
        await rm(join(root, 'orca-runtime.json'))
      }
      const expectedRuntimeId = mode === 'wrong-runtime' ? 'wrong-runtime' : runtime.getRuntimeId(),
        file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          expectedRuntimeId,
          executionHostId: 'local',
          expectedRendererId: 421,
          timeoutMs: 1000
        })
      )
      await main(['terminal', 'data-listener-count', '--request-file', file, '--json'])
      const success = mode === 'local' || mode === 'paired'
      expect(process.exitCode ?? 0, JSON.stringify(frames)).toBe(success ? 0 : 1)
      if (success) {
        expect(frames).toContainEqual(
          expect.objectContaining({
            ok: true,
            result: {
              expectedRuntimeId,
              executionHostId: 'local',
              rendererId: 421,
              count: 2,
              source: 'preload-pty-data-listeners',
              ptyDeliveryVerified: false
            }
          })
        )
      }
      if (mode === 'wrong-runtime' || mode === 'old-host') {
        expect(read).not.toHaveBeenCalled()
      }
    } finally {
      await server.stop()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
