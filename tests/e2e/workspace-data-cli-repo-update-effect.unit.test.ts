import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow } from 'electron'
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type { Repo } from '../../src/shared/repo-types'
import type * as SshGitDispatch from '../../src/main/providers/ssh-git-dispatch'

const fixture = vi.hoisted(() => ({ getProvider: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: class {} }))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ipc/repos/repos-changed-notification', () => ({
  notifyReposChanged: vi.fn()
}))
vi.mock('../../src/main/ipc/registered-worktree-roots-cache', () => ({
  invalidateAuthorizedRootsCache: vi.fn()
}))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/providers/ssh-git-dispatch', async (original) => ({
  ...(await original<typeof SshGitDispatch>()),
  getSshGitProvider: fixture.getProvider
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_REPO_UPDATE_HANDLERS } from '../../src/cli/handlers/workspace-repo-update'
import {
  WORKSPACE_REPO_UPDATE_METHODS,
  setDesktopRepoUpdateForRpc
} from '../../src/main/runtime/rpc/methods/workspace-repo-update'
import { registerRepoUpdateHandler } from '../../src/main/ipc/repos/repo-update-handler'
import { getRepoForExecutionHost } from '../../src/main/repo-execution-host-selection'
import * as rootPreparation from '../../src/main/worktree-root-preparation'
import { notifyReposChanged } from '../../src/main/ipc/repos/repos-changed-notification'
import { runProcess } from '../../src/shared/child-process/run-process'

let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let repo: Repo
let runtime: OrcaRuntimeService
async function input(value: unknown) {
  await writeFile(join(directory, 'input.json'), JSON.stringify(value))
  ctx.flags.set('params-file', 'input.json')
}
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-repo-update-cli-'))
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
  repo = {
    id: 'shared',
    path: directory,
    displayName: 'Folder',
    badgeColor: 'blue',
    addedAt: 1,
    kind: 'folder'
  }
  store.addRepo(repo)
  store.addRepo({ ...repo, connectionId: 'fixture' })
  runtime = new OrcaRuntimeService(store)
  vi.mocked(notifyReposChanged).mockClear()
  vi.spyOn(rootPreparation, 'prepareLocalWorktreeRootForRepo')
  registerRepoUpdateHandler(new BrowserWindow(), store)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_REPO_UPDATE_METHODS
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
  fixture.getProvider.mockReset()
  fixture.getProvider.mockReturnValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  setDesktopRepoUpdateForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('updates only the explicit host, notifies and persists before acknowledging', async () => {
  store.updateRepo(repo.id, { ghAccount: { host: 'github.com', user: 'existing' } }, 'ssh:fixture')
  await input({
    repoId: repo.id,
    hostId: 'ssh:fixture',
    updates: { displayName: 'Renamed', issueSourcePreference: 'origin', forkSyncMode: 'off' }
  })
  ctx.flags.set('confirm', repo.id)
  await WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)
  expect(lastResult()).toEqual({ updated: true, repoId: repo.id, hostId: 'ssh:fixture' })
  expect(getRepoForExecutionHost(store, repo.id, 'local')?.displayName).toBe('Folder')
  expect(getRepoForExecutionHost(store, repo.id, 'ssh:fixture')).toMatchObject({
    displayName: 'Renamed',
    issueSourcePreference: 'origin',
    forkSyncMode: 'off',
    ghAccount: { host: 'github.com', user: 'existing' }
  })
  expect(notifyReposChanged).toHaveBeenCalledTimes(1)
  expect(rootPreparation.prepareLocalWorktreeRootForRepo).not.toHaveBeenCalled()
  const disk = readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'repos')
  expect(JSON.stringify(disk)).toContain('Renamed')
})

it('preserves empty strings and explicit clearing sentinels', async () => {
  store.updateRepo(
    repo.id,
    { displayName: 'Before', worktreeBasePath: 'before', externalWorktreeVisibility: 'hide' },
    'local'
  )
  await input({
    repoId: repo.id,
    hostId: 'local',
    updates: {
      displayName: '',
      worktreeBasePath: '',
      externalWorktreeVisibility: null,
      ghAccount: null,
      sourceControlAi: null
    }
  })
  ctx.flags.set('confirm', repo.id)
  await WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)
  const updated = getRepoForExecutionHost(store, repo.id, 'local')
  expect(updated?.displayName).toBe('')
  expect(updated?.worktreeBasePath).toBeUndefined()
  expect(updated?.externalWorktreeVisibility).toBeUndefined()
  expect(updated?.ghAccount).toBeUndefined()
  expect(rootPreparation.prepareLocalWorktreeRootForRepo).toHaveBeenCalledTimes(1)
})

it('rejects unconfirmed, unknown host and malformed account or hook inputs before writing', async () => {
  await input({ repoId: repo.id, hostId: 'local', updates: { displayName: 'No write' } })
  await expect(WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', repo.id)
  for (const updates of [
    { ghAccount: { garbage: true } },
    { hookSettings: { mode: 'override', scripts: { setup: 1, archive: '' } } }
  ]) {
    await input({ repoId: repo.id, hostId: 'local', updates })
    await expect(WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
  }
  expect(ctx.client.call).not.toHaveBeenCalled()
  await input({ repoId: repo.id, hostId: 'ssh:absent', updates: { displayName: 'No write' } })
  await expect(WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)).rejects.toMatchObject({
    code: 'selector_not_found'
  })
  expect(notifyReposChanged).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})

it('reports save failure and absent or old services without success output', async () => {
  ctx.flags.set('confirm', repo.id)
  await input({ repoId: repo.id, hostId: 'local', updates: { displayName: 'Changed in memory' } })
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValueOnce(new Error('private-canary'))
  await expect(WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)).rejects.toThrow(
    'Desktop repository update failed.'
  )
  expect(console.log).not.toHaveBeenCalled()
  setDesktopRepoUpdateForRpc(null)
  await expect(WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(console.log).not.toHaveBeenCalled()
})

it('schedules the existing native root preflight and stores checked hook settings', async () => {
  expect(
    (await runProcess({ program: 'git', args: ['init', directory], cwd: directory })).code
  ).toBe(0)
  store.updateRepo(repo.id, { kind: 'git' }, 'local')
  const root = join(directory, 'own-worktree-root')
  const hookSettings = {
    mode: 'override',
    commandSourcePolicy: 'local-only',
    scripts: { setup: 'setup-canary', archive: '' }
  }
  await input({
    repoId: repo.id,
    hostId: 'local',
    updates: { worktreeBasePath: root, hookSettings }
  })
  ctx.flags.set('confirm', repo.id)
  await WORKSPACE_REPO_UPDATE_HANDLERS['repo update-desktop'](ctx)
  expect(rootPreparation.prepareLocalWorktreeRootForRepo).toHaveBeenCalledTimes(1)
  await vi.mocked(rootPreparation.prepareLocalWorktreeRootForRepo).mock.results.at(-1)?.value
  expect((await stat(root)).isDirectory()).toBe(true)
  expect(getRepoForExecutionHost(store, repo.id, 'local')?.hookSettings).toEqual({
    ...hookSettings,
    setupAgentStartupPolicy: 'start-immediately',
    setupRunPolicy: 'run-by-default'
  })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('setup-canary')
})
