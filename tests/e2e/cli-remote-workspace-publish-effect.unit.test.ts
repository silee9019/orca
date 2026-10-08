import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../config/scripts/vitest-host-ports-setup'
import { initDataPath } from '../../src/main/persistence/loading-store/user-data-path'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { Store } from '../../src/main/persistence/loading-store/store'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'
import { REMOTE_WORKSPACE_PUBLISH_METHODS } from '../../src/main/runtime/rpc/methods/remote-workspace-publish'
import { _resetRemoteWorkspaceCachesForTests } from '../../src/main/ipc/remote-workspace'
import { getRemoteSnapshot } from '../../src/main/ipc/remote-workspace-relay-sync'
const mocks = vi.hoisted(() => ({ call: vi.fn(), mux: vi.fn(), ssh: vi.fn() }))
vi.mock('../../src/main/ipc/ssh', () => ({
  getActiveMultiplexer: mocks.mux,
  getSshConnectionStore: mocks.ssh
}))
vi.mock('../../src/main/ipc/remote-workspace-events', () => ({
  registerRemoteWorkspaceNotificationHandler: vi.fn(() => vi.fn())
}))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = mocks.call
  }
}))
const targets = ['one', 'two'].map((id) => ({
  id,
  label: id,
  host: `${id}.example.invalid`,
  port: 22,
  username: 'fixture'
}))
const requests = new Map<string, ReturnType<typeof vi.fn>>()
let root: string
let store: Store
let dispatcher: RpcDispatcher
function snapshot(revision = 4) {
  return {
    namespace: 'target',
    revision,
    updatedAt: 1,
    schemaVersion: 1,
    session: {
      activeWorktreePath: '/private-before',
      activeTabId: null,
      tabsByWorktreePath: {},
      terminalLayoutsByTabId: {}
    }
  }
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-workspace-publish-'))
  installFakeAppEnvironment({ getPath: () => join(root, 'legacy') })
  initDataPath()
  const authority = new ProfileStateSqliteAuthority(join(root, 'profile.db'), 'publish-fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(root, 'data.json'), profileStateAuthority: authority })
  _resetRemoteWorkspaceCachesForTests()
  requests.clear()
  for (const target of targets) {
    requests.set(
      target.id,
      vi.fn(async (method: string) => {
        if (method === 'workspace.get') {
          return snapshot()
        }
        return { ok: true, snapshot: snapshot(5) }
      })
    )
  }
  mocks.ssh.mockReturnValue({
    listTargets: () => targets,
    getTarget: (id: string) => targets.find((t) => t.id === id)
  })
  mocks.mux.mockImplementation((id: string) =>
    requests.has(id) ? { request: requests.get(id) } : null
  )
  dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: REMOTE_WORKSPACE_PUBLISH_METHODS
  })
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await dispatcher.dispatch({
      id: 'publish',
      authToken: 'fixture',
      method,
      params
    })
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
  store.freezeWrites()
  await store.flushAsync()
  vi.restoreAllMocks()
  process.exitCode = undefined
  _resetRemoteWorkspaceCachesForTests()
  await rm(root, { recursive: true, force: true })
})
async function observed(id = 'one') {
  const target = targets.find((t) => t.id === id)
  if (!target) {
    throw new Error('Unknown fixture target')
  }
  const state = await getRemoteSnapshot(target)
  if (!state) {
    throw new Error('Fixture observation missing')
  }
  return {
    targetId: id,
    expectedRevision: state.revision,
    hostObservationToken: state.hostObservationToken
  }
}
async function command(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  await main(['terminal', 'publish-workspace', '--request-file', file, '--json'], root)
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}
it('uses actual host export and the canonical queue, excluding unselected targets and private state', async () => {
  const target = await observed()
  expect(await command({ targets: [target], confirm: true })).toMatchObject({
    ok: true,
    result: { allTargetsAccepted: true, targets: [{ accepted: true, revision: 5 }] }
  })
  expect(requests.get('one')).toHaveBeenCalledWith(
    'workspace.patch',
    expect.objectContaining({
      baseRevision: 4,
      patch: {
        kind: 'replace-session',
        session: expect.objectContaining({ activeWorktreePath: null })
      }
    })
  )
  expect(requests.get('two')).not.toHaveBeenCalled()
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-before')
  expect(process.exitCode).toBeUndefined()
})
it.each(['revision', 'token'])('refuses stale %s without a remote patch', async (kind) => {
  const target = await observed()
  if (kind === 'revision') {
    target.expectedRevision = 3
  } else {
    target.hostObservationToken = 'replaced-observation'
  }
  expect(await command({ targets: [target], confirm: true })).toMatchObject({
    result: { allTargetsAccepted: false, partialPublishPossible: true }
  })
  expect(requests.get('one')).toHaveBeenCalledTimes(1)
  expect(process.exitCode).toBe(1)
})
it('reports a partially accepted batch without echoing the provider error', async () => {
  const selected = await Promise.all(targets.map((t) => observed(t.id)))
  requests
    .get('two')
    ?.mockRejectedValue(Object.assign(new Error('private-provider-error'), { code: -32601 }))
  expect(await command({ targets: selected, confirm: true })).toMatchObject({
    result: {
      allTargetsAccepted: false,
      targets: [
        { targetId: 'one', accepted: true },
        { targetId: 'two', accepted: false, reason: 'unavailable' }
      ]
    }
  })
  expect(process.exitCode).toBe(1)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-provider-error')
})
it('reports a disconnected target as unavailable without falling back to another target', async () => {
  const target = await observed()
  requests.delete('one')
  expect(await command({ targets: [target], confirm: true })).toMatchObject({
    result: { targets: [{ accepted: false, reason: 'unavailable' }] }
  })
  expect(requests.get('two')).not.toHaveBeenCalled()
  expect(process.exitCode).toBe(1)
})
it('preserves canonical identical-session no-op without claiming a fresh remote write', async () => {
  const session = structuredClone(store.getWorkspaceSession())
  requests.get('one')?.mockResolvedValue({
    ...snapshot(),
    session: {
      activeWorktreePath: null,
      activeTabId: null,
      tabsByWorktreePath: {},
      terminalLayoutsByTabId: {}
    }
  })
  const target = await observed()
  expect(await command({ targets: [target], session, confirm: true })).toMatchObject({
    result: { allTargetsAccepted: true, targets: [{ revision: 4 }] }
  })
  expect(requests.get('one')).toHaveBeenCalledTimes(1)
})
it.each([{ confirm: false }, { targets: [] }, { session: { unknown: true } }])(
  'refuses invalid private input before RPC: %j',
  async (change) => {
    const target = await observed()
    expect(await command({ targets: [target], confirm: true, ...change })).toMatchObject({
      ok: false
    })
    expect(mocks.call).not.toHaveBeenCalled()
    expect(requests.get('one')).toHaveBeenCalledTimes(1)
  }
)
it('revalidates lossless session input at the host boundary', async () => {
  const target = await observed()
  expect(
    await dispatcher.dispatch({
      id: 'invalid',
      authToken: 'fixture',
      method: 'remoteWorkspace.publishTargets',
      params: { targets: [target], session: { private: 'invalid' }, confirm: true }
    })
  ).toMatchObject({ ok: false })
  expect(requests.get('one')).toHaveBeenCalledTimes(1)
})

it('exports the addressed persisted SSH partition while preserving local and other-host sessions', async () => {
  store.addRepo({
    id: 'remote-repo',
    path: '/remote',
    displayName: 'remote',
    badgeColor: 'blue',
    addedAt: 1,
    connectionId: 'one'
  })
  const worktreeId = 'remote-repo::/remote/private-folder'
  const tab = {
    id: 'private-tab',
    ptyId: 'private-pty',
    worktreeId,
    title: 'private-canary',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
  store.setWorkspaceSession(
    { ...store.getWorkspaceSession('ssh:one'), tabsByWorktree: { [worktreeId]: [tab] } },
    'ssh:one'
  )
  const before = structuredClone(store.getWorkspaceSession())
  const target = await observed()
  expect(await command({ targets: [target], confirm: true })).toMatchObject({
    result: { allTargetsAccepted: true }
  })
  expect(requests.get('one')).toHaveBeenCalledWith(
    'workspace.patch',
    expect.objectContaining({
      patch: expect.objectContaining({
        session: expect.objectContaining({
          tabsByWorktreePath: {
            '/remote/private-folder': [
              expect.objectContaining({ id: 'private-tab', title: 'private-canary' })
            ]
          }
        })
      })
    })
  )
  expect(store.getWorkspaceSession()).toEqual(before)
  expect(requests.get('two')).not.toHaveBeenCalled()
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-canary')
})
