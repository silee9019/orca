import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../config/scripts/vitest-host-ports-setup'
import { initDataPath } from '../../src/main/persistence/loading-store/user-data-path'
import { Store } from '../../src/main/persistence/loading-store/store'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
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
let root: string
let store: Store
let databasePath: string
const profileId = 'cli-session-state-fixture'
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-session-state-'))
  installFakeAppEnvironment({ getPath: () => join(root, 'legacy') })
  initDataPath()
  databasePath = join(root, 'profile-state.db')
  const authority = new ProfileStateSqliteAuthority(databasePath, profileId)
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(root, 'orca-data.json'), profileStateAuthority: authority })
  store.flushOrThrow()
  const runtime = new OrcaRuntimeService(store)
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { WORKSPACE_SESSION_STATE_METHODS } =
      await import('../../src/main/runtime/rpc/methods/workspace-session-state')
    const response = await new RpcDispatcher({
      runtime,
      methods: WORKSPACE_SESSION_STATE_METHODS
    }).dispatch({ id: 'session-state', authToken: 'fixture', method, params })
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
  await rm(root, { recursive: true, force: true })
})
async function command(action: string, request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  await main(['terminal', action, '--request-file', file, '--json'], root)
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}
it('reads the addressed local, SSH and paired host partitions without writing', async () => {
  store.patchWorkspaceSession({ activeWorktreeId: 'folder:local' })
  store.patchWorkspaceSession({ activeWorktreeId: 'folder:ssh' }, 'ssh:fixture')
  store.patchWorkspaceSession({ activeWorktreeId: 'folder:paired' }, 'runtime:fixture')
  await store.flushPendingOrThrowAsync()
  const before = readProfileStateDomain(databasePath, profileId, 'workspaceSession')
  for (const hostId of [undefined, null, 'local', 'ssh:fixture', 'runtime:fixture']) {
    expect(await command('session-state', { hostId })).toMatchObject({
      ok: true,
      result: { session: store.getWorkspaceSession(hostId) }
    })
    expect(process.exitCode).toBeUndefined()
  }
  expect(readProfileStateDomain(databasePath, profileId, 'workspaceSession')).toEqual(before)
})
it('acknowledges flush only after the pending local and SSH partitions are durable', async () => {
  store.patchWorkspaceSession({ activeWorktreeId: 'folder:pending-local' })
  store.patchWorkspaceSession({ activeWorktreeId: 'folder:pending-ssh' }, 'ssh:fixture')
  expect(await command('flush-session', { confirm: true })).toMatchObject({
    ok: true,
    result: { flushed: true }
  })
  expect(readProfileStateDomain(databasePath, profileId, 'workspaceSession')).toMatchObject({
    kind: 'value',
    value: { activeWorktreeId: 'folder:pending-local' }
  })
  expect(
    readProfileStateDomain(databasePath, profileId, 'workspaceSessionsByHostId')
  ).toMatchObject({
    kind: 'value',
    value: { 'ssh:fixture': { activeWorktreeId: 'folder:pending-ssh' } }
  })
})
it('refuses an invalid host and unconfirmed flush before RPC', async () => {
  expect(await command('session-state', { hostId: 'ssh:' })).toMatchObject({ ok: false })
  expect(await command('flush-session', {})).toMatchObject({ ok: false })
  expect(mocks.call).not.toHaveBeenCalled()
})
it('does not claim a frozen or failed write was flushed', async () => {
  store.freezeWrites()
  expect(await command('flush-session', { confirm: true })).toMatchObject({ ok: false })
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValue(new Error('fixture disk failure'))
  expect(await command('flush-session', { confirm: true })).toMatchObject({ ok: false })
})
it('fails once against an old host without a local fallback', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command('session-state', {})).toMatchObject({ ok: false })
  expect(mocks.call).toHaveBeenCalledTimes(1)
})

it('returns the canonical empty partition instead of falling back to local state', async () => {
  store.patchWorkspaceSession({ activeWorktreeId: 'folder:private-local' })
  const response = await command('session-state', { hostId: 'ssh:missing' })
  expect(response).toMatchObject({
    ok: true,
    result: { session: store.getWorkspaceSession('ssh:missing') }
  })
  expect(JSON.stringify(response)).not.toContain('folder:private-local')
})
it.each(['session-state', 'flush-session'])(
  'refuses %s when its host Store is absent',
  async (action) => {
    const { WORKSPACE_SESSION_STATE_METHODS } =
      await import('../../src/main/runtime/rpc/methods/workspace-session-state')
    const rpc = new RpcDispatcher({
      runtime: new OrcaRuntimeService(),
      methods: WORKSPACE_SESSION_STATE_METHODS
    })
    mocks.call.mockImplementation(async (method: string, params: unknown) => {
      const response = await rpc.dispatch({ id: 'missing', authToken: 'fixture', method, params })
      if (!response.ok) {
        throw new RuntimeRpcFailureError(response)
      }
      return response
    })
    expect(
      await command(action, action === 'flush-session' ? { confirm: true } : {})
    ).toMatchObject({ ok: false })
  }
)
