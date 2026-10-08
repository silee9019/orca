import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_REPO_BADGE_COLOR } from '../../src/shared/constants'
import type * as GitHubClient from '../../src/main/github/client'
import type { HandlerContext } from '../../src/cli/dispatch'
const fixture = vi.hoisted(() => ({
  outcome: vi.fn(),
  rateGate: vi.fn(),
  origin: vi.fn(),
  ui: vi.fn(),
  record: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: class {},
  webContents: { getAllWebContents: () => [] }
}))
vi.mock('../../src/main/github/client', async (importOriginal) => ({
  ...(await importOriginal<typeof GitHubClient>()),
  getPRForBranchOutcome: fixture.outcome
}))
vi.mock('../../src/main/github/github-api-repository', () => ({
  getOriginGitHubApiRepository: fixture.origin
}))
vi.mock('../../src/main/github/rate-limit', () => ({
  getRateLimit: vi.fn(),
  repositoryRateLimitGuard: fixture.rateGate,
  spendsSharedGitHubComQuota: () => false
}))
vi.mock('../../src/main/ipc/ui', () => ({ sendToTrustedUIRenderer: fixture.ui }))
vi.mock('../../src/main/crash-reporting/crash-breadcrumb-store', () => ({
  recordCoalescedCrashBreadcrumb: vi.fn()
}))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { registerDesktopGitHubRefreshHandlers } from '../../src/main/github-desktop-refresh-handlers'
import {
  WORKSPACE_GITHUB_REFRESH_METHODS,
  setDesktopGitHubRefreshForRpc
} from '../../src/main/runtime/rpc/methods/workspace-github-refresh'
import { WORKSPACE_GITHUB_REFRESH_HANDLERS } from '../../src/cli/handlers/workspace-github-refresh'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-github-refresh-'))
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => directory,
    getAppPath: () => directory,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  authority = new ProfileStateSqliteAuthority(join(directory, 'profile.db'), 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(directory, 'data.json'), profileStateAuthority: authority })
  fixture.outcome.mockReset().mockResolvedValue({ kind: 'no-pr', fetchedAt: 1000 })
  fixture.rateGate.mockReset().mockReturnValue({ blocked: false })
  fixture.origin
    .mockReset()
    .mockResolvedValue({ owner: 'fixture', repo: 'repo', host: 'github.com' })
  fixture.ui.mockClear()
  fixture.record.mockClear()
  vi.mocked(ipcMain.handle).mockClear()
  registerDesktopGitHubRefreshHandlers(store, fixture.record)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_GITHUB_REFRESH_METHODS
  })
  const client = new RuntimeClient('different-client-profile')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.useFakeTimers()
})
afterEach(async () => {
  vi.clearAllTimers()
  vi.useRealTimers()
  setDesktopGitHubRefreshForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
function repo(connectionId?: string) {
  store.addRepo({
    id: directory,
    displayName: 'fixture',
    badgeColor: DEFAULT_REPO_BADGE_COLOR,
    path: directory,
    kind: 'git',
    ...(connectionId ? { connectionId, executionHostId: `ssh:${connectionId}` as const } : {}),
    addedAt: 1
  })
  const saved = store.getRepos().find((entry) => entry.id === directory)
  if (!saved) {
    throw new Error('Missing fixture repository')
  }
  return saved
}
async function invoke(command: string, repoId: string, host = 'local', confirm = repoId) {
  const input = join(directory, 'params.json')
  await writeFile(
    input,
    JSON.stringify({
      repoId,
      branch: 'fixture',
      expectedRepoHostId: host,
      expectedExecutionHostId: 'local'
    })
  )
  ctx.flags.set('params-file', input)
  ctx.flags.set('confirm', confirm)
  await WORKSPACE_GITHUB_REFRESH_HANDLERS[`github ${command}`](ctx)
  const text = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof text !== 'string') {
    throw new Error('Missing fixture output')
  }
  return JSON.parse(text).result
}
it('runs the real coordinator with the registered SSH host and original observer callback', async () => {
  const registered = repo('fixture')
  const result = await invoke('refresh-pr-now', registered.id, 'ssh:fixture')
  expect(result.kind).toBe('no-pr')
  expect(fixture.outcome).toHaveBeenCalledWith(
    directory,
    'fixture',
    null,
    'fixture',
    null,
    expect.objectContaining({ localGitExecOptions: { admissionTier: 'interactive' } })
  )
  expect(fixture.record).toHaveBeenCalledWith(
    expect.objectContaining({ id: registered.id }),
    expect.objectContaining({ kind: 'no-pr' })
  )
  expect(fixture.ui).toHaveBeenCalledWith(
    'gh:prRefreshEvent',
    expect.objectContaining({
      reason: 'manual',
      outcome: expect.objectContaining({ kind: 'no-pr' })
    })
  )
})
it('accepts queued work separately from a later real coordinator drain', async () => {
  const registered = repo()
  vi.useFakeTimers()
  const result = await invoke('enqueue-pr-refresh', registered.id)
  expect(result).toEqual({ kind: 'queued' })
  expect(fixture.outcome).not.toHaveBeenCalled()
  await vi.runOnlyPendingTimersAsync()
  expect(fixture.outcome).toHaveBeenCalledOnce()
})
it('preserves the rate-limit pause while keeping upstream diagnostics out of CLI output', async () => {
  const registered = repo()
  fixture.rateGate.mockReturnValue({ blocked: true, resetAt: Math.ceil(Date.now() / 1000) + 60 })
  const paused = await invoke('refresh-pr-now', registered.id)
  expect(paused).toMatchObject({ kind: 'upstream-error', errorType: 'rate_limited' })
  expect(paused.retryDisabledUntil).toBeGreaterThan(Date.now())
  expect(fixture.outcome).not.toHaveBeenCalled()
})
it('redacts upstream failures and refuses wrong host, unknown repo and missing confirmation before lookup', async () => {
  const registered = repo()
  fixture.outcome.mockResolvedValue({
    kind: 'upstream-error',
    errorType: 'network',
    message: 'private credential detail',
    fetchedAt: 1000
  })
  const result = await invoke('refresh-pr-now', registered.id)
  expect(result.message).not.toContain('private credential')
  await expect(invoke('refresh-pr-now', registered.id, 'ssh:wrong')).rejects.toThrow()
  await expect(invoke('refresh-pr-now', 'missing')).rejects.toThrow()
  await expect(invoke('refresh-pr-now', registered.id, 'local', 'wrong')).rejects.toThrow()
  expect(fixture.outcome).toHaveBeenCalledOnce()
})
it('preserves the original IPC candidate and sender enqueue contract', async () => {
  repo()
  const candidate = {
    cacheKey: 'ui-fixture',
    repoId: directory,
    repoPath: directory,
    repoKind: 'git',
    branch: 'ui-branch'
  }
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'gh:refreshPRNow')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC callback')
  }
  const result = await Reflect.apply(callback, undefined, [
    undefined,
    { candidate, reason: 'manual' }
  ])
  expect(result.kind).toBe('no-pr')
  expect(fixture.outcome.mock.calls[0]?.[1]).toBe('ui-branch')
})
it('fails for unavailable desktop services and old peers without success output', async () => {
  const registered = repo()
  setDesktopGitHubRefreshForRpc(null)
  await expect(invoke('refresh-pr-now', registered.id)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('refresh-pr-now', registered.id)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(console.log).not.toHaveBeenCalled()
})

it('rejects runtime-host owners and folder repositories without a native lookup fallback', async () => {
  const registered = repo()
  store.updateRepo(registered.id, { executionHostId: 'runtime:fixture' })
  await expect(invoke('refresh-pr-now', registered.id, 'runtime:fixture')).rejects.toThrow()
  await expect(invoke('enqueue-pr-refresh', registered.id, 'runtime:fixture')).rejects.toThrow()
  store.updateRepo(registered.id, { executionHostId: 'local', kind: 'folder' })
  await expect(invoke('refresh-pr-now', registered.id)).rejects.toThrow()
  expect(fixture.outcome).not.toHaveBeenCalled()
})
