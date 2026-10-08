import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import {
  handleRemoteWorkspaceNotification,
  _resetRemoteWorkspaceCachesForTests
} from '../../src/main/ipc/remote-workspace'
import {
  REMOTE_WORKSPACE_CHANGED_NOTIFICATION,
  REMOTE_WORKSPACE_STALE_NOTIFICATION
} from '../../src/shared/remote-workspace-types'
import { main } from '../../src/cli/index'
import { STATUS_METHODS } from '../../src/main/runtime/rpc/methods/status'
import { readMetadata } from '../../src/cli/runtime/metadata'
import { getRemoteWorkspaceChangeObserverCount } from '../../src/main/ipc/remote-workspace-change-observers'

const ssh = vi.hoisted(() => ({ getStore: vi.fn(), getMux: vi.fn() }))
vi.mock('../../src/main/ipc/ssh', () => ({
  getSshConnectionStore: ssh.getStore,
  getActiveMultiplexer: ssh.getMux
}))

it.each([
  'local',
  'paired',
  'old-local',
  'old-paired',
  'missing-store',
  'missing-target',
  'invalid-request',
  'resync',
  'replacement',
  'cancelled'
])('preserves selected canonical workspace changes and lifetime boundaries: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-workspace-watch-'))
  const runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  const paired = mode === 'paired' || mode === 'old-paired'
  const server = new OrcaRuntimeRpcServer({
    runtime,
    userDataPath: root,
    enableWebSocket: paired,
    wsPort: 0,
    pinnedBindHost: '127.0.0.1',
    ...(mode === 'old-paired' ? { methods: STATUS_METHODS } : {})
  })
  ssh.getStore.mockReturnValue(
    mode === 'missing-store'
      ? null
      : {
          getTarget: (id: string) =>
            mode === 'missing-target' ? null : { id, host: 'fixture.invalid', username: 'fixture' },
          listTargets: () => []
        }
  )
  ssh.getMux.mockReturnValue(null)
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  const frames: unknown[] = []
  vi.spyOn(console, 'log').mockImplementation((value: unknown) =>
    frames.push(JSON.parse(String(value)))
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let interrupt: (() => void) | undefined
  if (mode === 'cancelled') {
    const original = process.on
    vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      if (event === 'SIGINT') {
        interrupt = () => listener()
        return process
      }
      return original.call(process, event, listener)
    })
  }
  let pending: Promise<void> | undefined
  try {
    await server.start()
    const secret = readMetadata(root).authToken
    let pairingSecret: string | undefined
    if (paired) {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'fixture-workspace-watch',
        scope: 'runtime'
      })
      if (!offer.available) {
        throw new Error('Fixture pairing unavailable')
      }
      pairingSecret = offer.pairingUrl
      vi.stubEnv('ORCA_PAIRING_CODE', pairingSecret)
      await rm(join(root, 'orca-runtime.json'))
    } else if (mode === 'old-local') {
      await writeFile(
        join(root, 'orca-runtime.json'),
        JSON.stringify({ ...readMetadata(root), remoteWorkspaceStreaming: undefined })
      )
    }
    const file = join(root, 'watch.json')
    await writeFile(
      file,
      JSON.stringify({
        targetIds:
          mode === 'invalid-request'
            ? ['fixture-selected', 'fixture-selected']
            : ['fixture-selected'],
        watchMs: 1000
      })
    )
    pending = main(['agent', 'remote-workspace', 'watch', '--request-file', file, '--json'], root)
    if (
      ['old-local', 'old-paired', 'missing-store', 'missing-target', 'invalid-request'].includes(
        mode
      )
    ) {
      await pending
      expect(process.exitCode).toBe(1)
      expect(frames).toContainEqual(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            code:
              mode === 'old-local'
                ? 'method_not_supported'
                : mode === 'old-paired'
                  ? 'method_not_found'
                  : mode === 'invalid-request'
                    ? 'invalid_argument'
                    : 'remote_workspace_unavailable'
          })
        })
      )
      expect(getRemoteWorkspaceChangeObserverCount()).toBe(0)
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
    } else if (mode === 'resync') {
      const request = vi.fn().mockResolvedValue({
        namespace: 'fixture-selected',
        revision: 7,
        updatedAt: 7,
        schemaVersion: 1,
        session: {
          activeWorktreePath: '/fixture/remote',
          activeTabId: 'fixture-resynced',
          tabsByWorktreePath: {},
          terminalLayoutsByTabId: {}
        }
      })
      ssh.getMux.mockReturnValue({ request })
      expect(request).not.toHaveBeenCalled()
      handleRemoteWorkspaceNotification('fixture-selected', REMOTE_WORKSPACE_STALE_NOTIFICATION, {
        namespace: 'fixture-selected'
      })
      await vi.waitFor(() =>
        expect(frames).toContainEqual(
          expect.objectContaining({
            type: 'event',
            change: expect.objectContaining({ snapshot: expect.objectContaining({ revision: 7 }) })
          })
        )
      )
      expect(request).toHaveBeenCalledOnce()
    } else {
      if (mode === 'replacement') {
        ssh.getStore.mockReturnValue({
          getTarget: (id: string) => ({ id, host: 'replacement.invalid', username: 'fixture' })
        })
      }
      for (const [targetId, revision] of [
        ['fixture-selected', 1],
        ['fixture-other', 1],
        ['fixture-selected', 2]
      ] as const) {
        handleRemoteWorkspaceNotification(targetId, REMOTE_WORKSPACE_CHANGED_NOTIFICATION, {
          snapshot: {
            namespace: targetId,
            revision,
            schemaVersion: 1,
            updatedAt: revision,
            session: {
              activeWorktreePath: '/fixture/remote',
              activeTabId: `private-fixture-tab-${revision}`,
              tabsByWorktreePath: {},
              terminalLayoutsByTabId: {}
            }
          },
          sourceClientId: 'fixture-remote-client'
        })
      }
    }
    await pending
    expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : mode === 'replacement' ? 1 : 0)
    if (mode === 'local' || mode === 'paired') {
      expect(frames).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'event',
            sequence: 1,
            change: expect.objectContaining({
              targetId: 'fixture-selected',
              snapshot: expect.objectContaining({ revision: 1 })
            })
          }),
          expect.objectContaining({
            type: 'event',
            sequence: 2,
            change: expect.objectContaining({
              targetId: 'fixture-selected',
              snapshot: expect.objectContaining({ revision: 2 })
            })
          })
        ])
      )
    }
    expect(JSON.stringify(frames)).not.toContain('fixture-other')
    expect(JSON.stringify(frames)).not.toContain(secret)
    if (pairingSecret) {
      expect(JSON.stringify(frames)).not.toContain(pairingSecret)
    }
    await vi.waitFor(() => expect(getRemoteWorkspaceChangeObserverCount()).toBe(0))
    if (mode === 'replacement') {
      expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
    }
  } finally {
    await pending
    await server.stop()
    _resetRemoteWorkspaceCachesForTests()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
