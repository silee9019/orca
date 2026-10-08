import { ProfileStateIndeterminateWriteError } from '../../src/main/persistence/profile-state/profile-state-write-transaction'
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
let authority: ProfileStateSqliteAuthority
const profileId = 'cli-session-state-fixture'
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-session-state-'))
  installFakeAppEnvironment({ getPath: () => join(root, 'legacy') })
  initDataPath()
  databasePath = join(root, 'profile-state.db')
  authority = new ProfileStateSqliteAuthority(databasePath, profileId)
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(root, 'orca-data.json'), profileStateAuthority: authority })
  store.flushOrThrow()
  const runtime = new OrcaRuntimeService(store)
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { WORKSPACE_SESSION_WRITE_METHODS } =
      await import('../../src/main/runtime/rpc/methods/workspace-session-write')
    const response = await new RpcDispatcher({
      runtime,
      methods: WORKSPACE_SESSION_WRITE_METHODS
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
function request(hostId = 'local') {
  const expected = structuredClone(store.getWorkspaceSession(hostId))
  return {
    hostId,
    expected,
    next: { ...expected, activeWorktreeId: 'folder:private-next' },
    confirm: true
  }
}
it('writes through the actual canonical Store and acknowledges only after SQLite read-back', async () => {
  expect(await command('set-session', request())).toMatchObject({
    ok: true,
    result: { applied: true, durable: true }
  })
  expect(readProfileStateDomain(databasePath, profileId, 'workspaceSession')).toMatchObject({
    kind: 'value',
    value: { activeWorktreeId: 'folder:private-next' }
  })
  expect(String(vi.mocked(console.log).mock.calls.at(-1)?.[0])).not.toContain('private-next')
})
it('writes only the explicitly addressed SSH partition', async () => {
  store.patchWorkspaceSession({ activeWorktreeId: 'folder:private-local' })
  const before = structuredClone(store.getWorkspaceSession())
  expect(await command('set-session', request('ssh:fixture'))).toMatchObject({
    ok: true,
    result: { applied: true, durable: true }
  })
  expect(store.getWorkspaceSession()).toEqual(before)
  expect(
    readProfileStateDomain(databasePath, profileId, 'workspaceSessionsByHostId')
  ).toMatchObject({
    kind: 'value',
    value: { 'ssh:fixture': { activeWorktreeId: 'folder:private-next' } }
  })
})
it('refuses a stale preimage without overwriting a newer session or freezing later writes', async () => {
  const stale = request()
  store.patchWorkspaceSession({ activeWorktreeId: 'folder:newer' })
  expect(await command('set-session', stale)).toMatchObject({ ok: false })
  expect(store.getWorkspaceSession().activeWorktreeId).toBe('folder:newer')
  expect(await command('set-session', request())).toMatchObject({ ok: true })
})
it.each([
  { unknown: true },
  { tabsByWorktree: { 'folder:fixture': [null] } },
  { activeWorktreeId: 42 }
])('rejects input the salvage validator would change: %j', async (change) => {
  const baseline = request()
  expect(
    await command('set-session', { ...baseline, next: { ...baseline.next, ...change } })
  ).toMatchObject({ ok: false })
  expect(mocks.call).not.toHaveBeenCalled()
})
it('refuses a frozen profile without changing memory', async () => {
  const baseline = request()
  store.freezeWrites()
  expect(await command('set-session', baseline)).toMatchObject({ ok: false })
  expect(store.getWorkspaceSession()).toEqual(baseline.expected)
})
it('does not claim success when SQLite rejects the write and rolls back its session fields', async () => {
  const baseline = request()
  vi.spyOn(authority, 'writeSerializedDomains').mockImplementation(() => {
    throw new Error('fixture write failed')
  })
  vi.spyOn(authority, 'writeCompleteSerializedDomains').mockImplementation(() => {
    throw new Error('fixture write failed')
  })
  expect(await command('set-session', baseline)).toMatchObject({ ok: false })
  expect(store.getWorkspaceSession()).toEqual(baseline.expected)
})
it('refuses an unknown host and missing confirmation before RPC', async () => {
  expect(await command('set-session', { ...request(), hostId: 'ssh:' })).toMatchObject({
    ok: false
  })
  expect(await command('set-session', { ...request(), confirm: false })).toMatchObject({
    ok: false
  })
  expect(mocks.call).not.toHaveBeenCalled()
})

it('compares JSON objects by value when keys are reordered', async () => {
  const baseline = request()
  expect(
    await command('set-session', {
      ...baseline,
      expected: Object.fromEntries(Object.entries(baseline.expected).toReversed())
    })
  ).toMatchObject({ ok: true, result: { durable: true } })
})
it('refuses malformed snapshots again at the RPC boundary without poisoning the write queue', async () => {
  const baseline = request()
  await expect(
    mocks.call('session.replaceState', { ...baseline, next: { ...baseline.next, activeTabId: 42 } })
  ).rejects.toThrow()
  expect(store.getWorkspaceSession()).toEqual(baseline.expected)
  expect(await command('set-session', baseline)).toMatchObject({ ok: true })
})
it('retains indeterminate persistence outcomes without claiming rollback or success', async () => {
  const baseline = request()
  const failure = new ProfileStateIndeterminateWriteError(
    new Error('fixture commit unknown'),
    new Error('fixture rollback unknown')
  )
  vi.spyOn(authority, 'writeSerializedDomains').mockImplementation(() => {
    throw failure
  })
  vi.spyOn(authority, 'writeCompleteSerializedDomains').mockImplementation(() => {
    throw failure
  })
  expect(await command('set-session', baseline)).toMatchObject({ ok: false })
  expect(store.getWorkspaceSession().activeWorktreeId).toBe('folder:private-next')
  expect(readProfileStateDomain(databasePath, profileId, 'workspaceSession')).not.toMatchObject({
    kind: 'value',
    value: { activeWorktreeId: 'folder:private-next' }
  })
})
it('retains explicit old-host refusal without retrying locally', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command('set-session', request())).toMatchObject({ ok: false })
  expect(mocks.call).toHaveBeenCalledTimes(1)
})

it('patches only the requested slice through the canonical partial setter and persists it', async () => {
  const baseline = request()
  const partial = vi.spyOn(store, 'patchWorkspaceSession')
  expect(
    await command('patch-session', {
      hostId: 'local',
      expected: baseline.expected,
      patch: { activeWorktreeId: 'folder:patched' },
      confirm: true
    })
  ).toMatchObject({ ok: true, result: { applied: true, durable: true } })
  expect(partial).toHaveBeenCalledWith({ activeWorktreeId: 'folder:patched' }, 'local')
  expect(readProfileStateDomain(databasePath, profileId, 'workspaceSession')).toMatchObject({
    kind: 'value',
    value: { activeWorktreeId: 'folder:patched' }
  })
})
it('refuses a stale partial write while preserving unrelated newer fields', async () => {
  const baseline = request()
  store.patchWorkspaceSession({ activeTabId: 'newer-tab' })
  expect(
    await command('patch-session', {
      hostId: 'local',
      expected: baseline.expected,
      patch: { activeWorktreeId: 'folder:patched' },
      confirm: true
    })
  ).toMatchObject({ ok: false })
  expect(store.getWorkspaceSession().activeTabId).toBe('newer-tab')
  expect(store.getWorkspaceSession().activeWorktreeId).toBe(baseline.expected.activeWorktreeId)
})
it('validates partial fields against the lossless full session before RPC', async () => {
  const baseline = request()
  expect(
    await command('patch-session', {
      hostId: 'local',
      expected: baseline.expected,
      patch: { activeTabId: 42 },
      confirm: true
    })
  ).toMatchObject({ ok: false })
  expect(mocks.call).not.toHaveBeenCalled()
})
