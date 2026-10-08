import '../../src/main/daemon/mock-descendant-sweep'
import { copyFile, rm } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import {
  createMockSubprocess,
  startDaemonAdapterHarness
} from '../../src/main/daemon/daemon-pty-adapter-test-harness'
import { getDaemonTokenPath } from '../../src/main/daemon/daemon-spawner'
import { cleanupDaemonForProtocol } from '../../src/main/daemon/daemon-protocol-cleanup'
import { DaemonClient } from '../../src/main/daemon/client'
import { PROTOCOL_VERSION } from '../../src/main/daemon/types'
import { killStaleDaemon } from '../../src/main/daemon/daemon-stale-kill'

vi.mock('../../src/main/daemon/daemon-stale-kill', () => ({
  killStaleDaemon: vi.fn(() => {
    throw new Error('PID fallback must not execute')
  })
}))
it.each(['matched', 'stale', 'unverifiable', 'lost-after-list', 'list-failed', 'endpoint-absent'])(
  'pins authenticated daemon shutdown without PID fallback: %s',
  async (mode) => {
    const subprocess = createMockSubprocess()
    const forceKill = vi.spyOn(subprocess, 'forceKill')
    const harness = await startDaemonAdapterHarness(() => subprocess)
    try {
      await copyFile(harness.tokenPath, getDaemonTokenPath(harness.dir))
      await harness.adapter.spawn({ cols: 80, rows: 24 })
      const identity = harness.adapter.getDaemonIdentity()
      if (!identity) {
        throw new Error('Fixture identity unavailable')
      }
      if (mode === 'unverifiable') {
        vi.spyOn(DaemonClient.prototype, 'getDaemonIdentity').mockReturnValue(null)
      }
      if (mode === 'lost-after-list') {
        vi.spyOn(DaemonClient.prototype, 'getDaemonIdentity')
          .mockReturnValueOnce(identity)
          .mockReturnValue(null)
      }
      if (mode === 'list-failed') {
        vi.spyOn(DaemonClient.prototype, 'request').mockRejectedValueOnce(
          new Error('Fixture list unavailable')
        )
      }
      if (mode === 'endpoint-absent') {
        await harness.server.shutdown()
      }
      const pending = cleanupDaemonForProtocol(
        harness.dir,
        PROTOCOL_VERSION,
        mode === 'stale' ? { ...identity, launchNonce: 'stale' } : identity
      )
      if (mode === 'matched') {
        await expect(pending).resolves.toMatchObject({ cleaned: true, killedCount: 1 })
        expect(forceKill).toHaveBeenCalledOnce()
      } else {
        await expect(pending).rejects.toThrow()
        if (mode !== 'endpoint-absent') {
          expect(forceKill).not.toHaveBeenCalled()
        }
      }
      expect(killStaleDaemon).not.toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
      harness.adapter.dispose()
      await harness.server.shutdown()
      await rm(harness.dir, { recursive: true, force: true })
    }
  }
)
