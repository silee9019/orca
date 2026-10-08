import './mock-descendant-sweep'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DaemonPtyAdapter } from './daemon-pty-adapter'
import { DaemonPtyRouter } from './daemon-pty-router'
import {
  createMockSubprocess,
  startDaemonAdapterHarness,
  type DaemonAdapterHarness
} from './daemon-pty-adapter-test-harness'
import { listManagedDaemonSessions, stopManagedDaemonSession } from './daemon-management'

const provider = vi.hoisted(() => {
  const state: { current: DaemonPtyAdapter | DaemonPtyRouter | undefined } = { current: undefined }
  return state
})
vi.mock('./daemon-init', () => ({ getDaemonProvider: () => provider.current }))
let harness: DaemonAdapterHarness
let subprocess: ReturnType<typeof createMockSubprocess>
beforeEach(async () => {
  subprocess = createMockSubprocess()
  harness = await startDaemonAdapterHarness(() => subprocess)
  provider.current = harness.adapter
})
afterEach(async () => {
  vi.restoreAllMocks()
  provider.current = undefined
  harness.adapter.dispose()
  await harness.server.shutdown()
  rmSync(harness.dir, { recursive: true, force: true })
})

async function spawnTarget() {
  const { id } = await harness.adapter.spawn({ cols: 80, rows: 24 })
  const row = (await harness.adapter.listSessions()).find((entry) => entry.sessionId === id)
  if (!row?.incarnationId) {
    throw new Error('Missing fixture session')
  }
  return {
    sessionId: id,
    incarnationId: row.incarnationId,
    protocolVersion: harness.adapter.protocolVersion,
    confirm: true as const
  }
}

it('lists metadata on the addressed host without exposing agent ownership records', async () => {
  const target = await spawnTarget()
  const result = await listManagedDaemonSessions()
  expect(result).toMatchObject({ executionHostId: 'local', complete: true })
  expect(result.observations[0]?.sessions?.[0]).toMatchObject({
    sessionId: target.sessionId,
    incarnationId: target.incarnationId
  })
  expect(JSON.stringify(result)).not.toContain('agentSessionOwners')
})

it('preserves an unreachable daemon and an absent provider as incomplete inventories', async () => {
  vi.spyOn(harness.adapter, 'listSessions').mockRejectedValue(new Error('private transport detail'))
  expect(await listManagedDaemonSessions()).toMatchObject({
    complete: false,
    observations: [{ status: 'unverifiable' }]
  })
  provider.current = undefined
  expect(await listManagedDaemonSessions()).toMatchObject({ complete: false, observations: [] })
})

it('stops the exact observed process and reads back its absence from its daemon', async () => {
  const target = await spawnTarget()
  expect(await stopManagedDaemonSession(target)).toMatchObject({ verdict: { status: 'exited' } })
  expect(subprocess.forceKill).toHaveBeenCalledOnce()
  expect(await harness.adapter.listSessions()).toEqual([])
})

it('keeps the reachable adapter inventory when a legacy adapter cannot answer', async () => {
  const target = await spawnTarget()
  const legacy = new DaemonPtyAdapter({
    socketPath: join(harness.dir, 'absent.sock'),
    tokenPath: harness.tokenPath,
    protocolVersion: 23
  })
  const router = new DaemonPtyRouter({ current: harness.adapter, legacy: [legacy] })
  provider.current = router
  try {
    const result = await listManagedDaemonSessions()
    expect(result.complete).toBe(false)
    expect(result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'live',
          sessions: expect.arrayContaining([
            expect.objectContaining({ sessionId: target.sessionId })
          ])
        }),
        { protocolVersion: 23, status: 'unverifiable' }
      ])
    )
  } finally {
    provider.current = harness.adapter
    router.disposeRouterOnly()
    legacy.dispose()
  }
})

it('rejects a changed incarnation without sending a signal', async () => {
  const target = await spawnTarget()
  await expect(stopManagedDaemonSession({ ...target, incarnationId: 'stale' })).rejects.toThrow(
    'incarnation'
  )
  expect(subprocess.kill).not.toHaveBeenCalled()
  expect(subprocess.forceKill).not.toHaveBeenCalled()
})

it('keeps loss of contact before a stop unverifiable and sends no signal', async () => {
  const target = await spawnTarget()
  vi.spyOn(harness.adapter, 'listSessions').mockRejectedValue(new Error('disconnected'))
  expect(await stopManagedDaemonSession(target)).toMatchObject({
    verdict: { status: 'unverifiable' }
  })
  expect(subprocess.forceKill).not.toHaveBeenCalled()
})

it('keeps a lost readback unverifiable after a stop request', async () => {
  const target = await spawnTarget()
  const rows = await harness.adapter.listSessions()
  vi.spyOn(harness.adapter, 'listSessions')
    .mockResolvedValueOnce(rows)
    .mockRejectedValue(new Error('disconnected'))
  expect(await stopManagedDaemonSession(target)).toMatchObject({
    verdict: { status: 'unverifiable' }
  })
})

it('reports live when a failed stop leaves the exact process present', async () => {
  const target = await spawnTarget()
  vi.spyOn(harness.adapter, 'shutdown').mockRejectedValue(new Error('refused'))
  expect(await stopManagedDaemonSession(target)).toMatchObject({ verdict: { status: 'live' } })
  expect(subprocess.forceKill).not.toHaveBeenCalled()
})
