import './mock-descendant-sweep'
import { rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DaemonClient } from './client'
import {
  createMockSubprocess,
  startDaemonAdapterHarness,
  type DaemonAdapterHarness
} from './daemon-pty-adapter-test-harness'

let harness: DaemonAdapterHarness
let subprocess: ReturnType<typeof createMockSubprocess>
beforeEach(async () => {
  subprocess = createMockSubprocess()
  harness = await startDaemonAdapterHarness(() => subprocess)
})
afterEach(async () => {
  vi.restoreAllMocks()
  harness.adapter.dispose()
  await harness.server.shutdown()
  rmSync(harness.dir, { recursive: true, force: true })
})

describe('incarnation-fenced daemon kill', () => {
  it('negotiates the guard and kills only the observed incarnation over an isolated socket', async () => {
    const { id } = await harness.adapter.spawn({ cols: 80, rows: 24 })
    const row = (await harness.adapter.listSessions()).find((session) => session.sessionId === id)
    if (!row?.incarnationId) {
      throw new Error('Missing fixture incarnation')
    }
    expect(harness.adapter.supportsIncarnationFencedKill()).toBe(true)
    await harness.adapter.shutdown(id, {
      immediate: true,
      expectedIncarnationId: row.incarnationId
    })
    expect(subprocess.forceKill).toHaveBeenCalledOnce()
    expect(await harness.adapter.listSessions()).toEqual([])
  })
  it('refuses a stale incarnation before stopping the subprocess', async () => {
    const { id } = await harness.adapter.spawn({ cols: 80, rows: 24 })
    await expect(
      harness.adapter.shutdown(id, {
        immediate: true,
        expectedIncarnationId: 'stale-incarnation'
      })
    ).rejects.toThrow('incarnation')
    expect(subprocess.kill).not.toHaveBeenCalled()
    expect(subprocess.forceKill).not.toHaveBeenCalled()
    expect(
      (await harness.adapter.listSessions()).find((row) => row.sessionId === id)?.isAlive
    ).toBe(true)
  })
  it('does not send a destructive request to a daemon without the negotiated guard', async () => {
    const { id } = await harness.adapter.spawn({ cols: 80, rows: 24 })
    vi.spyOn(DaemonClient.prototype, 'hasCapability').mockReturnValue(false)
    await expect(
      harness.adapter.shutdown(id, {
        immediate: true,
        expectedIncarnationId: 'observed-incarnation'
      })
    ).rejects.toThrow('unsupported')
    expect(subprocess.kill).not.toHaveBeenCalled()
    expect(subprocess.forceKill).not.toHaveBeenCalled()
  })
})
