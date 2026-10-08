import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'
import type { RemoteWorkspaceSnapshot } from '../../src/shared/remote-workspace-types'
import { CLIENT_ID } from '../../src/main/ipc/remote-workspace-client-identity'
import { getRemoteWorkspaceNamespace } from '../../src/main/ipc/remote-workspace-namespace'
import {
  clearRemoteWorkspaceSnapshotCache,
  getCachedRemoteWorkspaceSnapshot
} from '../../src/main/ipc/remote-workspace-snapshot-cache'

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  getStore: vi.fn(),
  getMux: vi.fn(),
  request: vi.fn()
}))
vi.mock('../../src/main/ipc/ssh', () => ({
  getSshConnectionStore: mocks.getStore,
  getActiveMultiplexer: mocks.getMux
}))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  return {
    RuntimeClient: class {
      readonly isRemote = false
      call = mocks.call
    },
    ...errors
  }
})
const target = {
  id: 'fixture-ssh',
  label: 'Fixture',
  host: 'fixture.invalid',
  port: 22,
  username: 'fixture'
}
const disconnected = { ...target, id: 'offline' }
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-remote-workspace-'))
  clearRemoteWorkspaceSnapshotCache()
  mocks.getStore.mockReturnValue({
    getTarget: (id: string) => (id === target.id ? target : null),
    listTargets: () => [target, disconnected]
  })
  mocks.getMux.mockImplementation((id: string) =>
    id === target.id ? { request: mocks.request } : null
  )
  mocks.request.mockReset().mockImplementation(async (method: string) => {
    if (method === 'workspace.presence') {
      return {
        clients: [
          { clientId: CLIENT_ID, name: ' Fixture device ', lastSeenAt: 123 },
          { clientId: 'other', name: 'Other device', lastSeenAt: 124 }
        ]
      }
    }
    const snapshot: RemoteWorkspaceSnapshot = {
      namespace: getRemoteWorkspaceNamespace(target),
      revision: 7,
      updatedAt: 123,
      schemaVersion: 1,
      session: {
        activeWorktreePath: '/fixture/remote',
        activeTabId: null,
        tabsByWorktreePath: {},
        terminalLayoutsByTabId: {}
      }
    }
    return snapshot
  })
  const runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'readMachineName').mockReturnValue('Fixture host')
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { REMOTE_WORKSPACE_READ_METHODS } =
      await import('../../src/main/runtime/rpc/methods/remote-workspace-read')
    const response = await new RpcDispatcher({
      runtime,
      methods: REMOTE_WORKSPACE_READ_METHODS
    }).dispatch({ id: 'remote-workspace', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  clearRemoteWorkspaceSnapshotCache()
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command(action: string, request?: unknown) {
  const file = join(root, 'request.json')
  if (request !== undefined) {
    await writeFile(file, JSON.stringify(request))
  }
  vi.mocked(console.log).mockClear()
  await main(
    [
      'agent',
      'remote-workspace',
      action,
      ...(request === undefined ? [] : ['--request-file', file]),
      '--json'
    ],
    root
  )
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}
it('reads and observes the canonical remote snapshot using the target namespace', async () => {
  const response = await command('state', { targetId: target.id })
  expect(response).toMatchObject({
    ok: true,
    result: { snapshot: { revision: 7, session: { activeWorktreePath: '/fixture/remote' } } }
  })
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith('workspace.get', {
    namespace: getRemoteWorkspaceNamespace(target)
  })
  expect(getCachedRemoteWorkspaceSnapshot(target.id)).toEqual(response.result.snapshot)
})
it('lists only targets with the canonical active multiplexer and returns the stable client identity', async () => {
  expect(await command('targets')).toMatchObject({ ok: true, result: { targetIds: [target.id] } })
  expect(await command('client-id')).toMatchObject({ ok: true, result: { clientId: CLIENT_ID } })
  expect(mocks.request).not.toHaveBeenCalled()
})
it('uses canonical presence normalization and the runtime name for selected targets', async () => {
  expect(await command('clients', { targetIds: [target.id] })).toMatchObject({
    ok: true,
    result: {
      complete: false,
      targets: [
        {
          targetId: target.id,
          clients: [
            { clientId: CLIENT_ID, name: 'Fixture device', isCurrent: true },
            { clientId: 'other', isCurrent: false }
          ]
        }
      ]
    }
  })
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith('workspace.presence', {
    namespace: getRemoteWorkspaceNamespace(target),
    clientId: CLIENT_ID,
    clientName: 'Fixture host'
  })
})
it('does not substitute local state for missing, disconnected or old relays', async () => {
  expect(await command('state', { targetId: 'missing' })).toMatchObject({
    ok: true,
    result: { snapshot: null }
  })
  mocks.getMux.mockReturnValue(null)
  expect(await command('state', { targetId: target.id })).toMatchObject({
    ok: true,
    result: { snapshot: null }
  })
  mocks.getMux.mockReturnValue({ request: mocks.request })
  mocks.request.mockRejectedValue(Object.assign(new Error('old relay'), { code: -32601 }))
  expect(await command('state', { targetId: target.id })).toMatchObject({
    ok: true,
    result: { snapshot: null }
  })
})
it('keeps transport failure as an error for state and best-effort incomplete presence for clients', async () => {
  mocks.request.mockRejectedValue(new Error('fixture disconnected'))
  expect(await command('state', { targetId: target.id })).toMatchObject({ ok: false })
  expect(await command('clients', { targetIds: [target.id] })).toMatchObject({
    ok: true,
    result: { complete: false, targets: [{ targetId: target.id, clients: [] }] }
  })
})
it('refuses an uninstalled connection store and invalid target before RPC', async () => {
  expect(await command('state', { targetId: '' })).toMatchObject({ ok: false })
  expect(mocks.call).not.toHaveBeenCalled()
  mocks.getStore.mockReturnValue(null)
  expect(await command('targets')).toMatchObject({ ok: false })
})
it('fails once against an old host without retrying locally', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command('state', { targetId: target.id })).toMatchObject({ ok: false })
  expect(mocks.call).toHaveBeenCalledTimes(1)
})

it('preserves the canonical observation token when the same snapshot is read again', async () => {
  const first = await command('state', { targetId: target.id })
  const second = await command('state', { targetId: target.id })
  expect(second.result.snapshot.hostObservationToken).toBe(
    first.result.snapshot.hostObservationToken
  )
  expect(typeof first.result.snapshot.hostObservationToken).toBe('string')
})
