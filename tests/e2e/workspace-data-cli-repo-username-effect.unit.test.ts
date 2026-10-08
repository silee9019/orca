import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type { Repo } from '../../src/shared/repo-types'
import type * as SshGitDispatch from '../../src/main/providers/ssh-git-dispatch'

const fixture = vi.hoisted(() => ({ getProvider: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: class {} }))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
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
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_REPO_USERNAME_HANDLERS } from '../../src/cli/handlers/workspace-repo-username'
import {
  WORKSPACE_REPO_USERNAME_METHODS,
  setRepoGitUsernameReaderForRpc
} from '../../src/main/runtime/rpc/methods/workspace-repo-username'
import { registerRepoGitUsernameHandler } from '../../src/main/ipc/repos/repo-git-username-handler'
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
  directory = await mkdtemp(join(tmpdir(), 'orca-repo-username-cli-'))
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
    kind: 'git'
  }
  store.addRepo(repo)
  store.addRepo({ ...repo, connectionId: 'fixture' })
  for (const args of [
    ['init', directory],
    ['-C', directory, 'config', 'github.user', 'native-user']
  ]) {
    const result = await runProcess({ program: 'git', args, cwd: directory })
    expect(result.code).toBe(0)
  }
  runtime = new OrcaRuntimeService(store)
  registerRepoGitUsernameHandler(store)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_REPO_USERNAME_METHODS
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
  setRepoGitUsernameReaderForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('uses native explicit Git config and the selected SSH provider for duplicate IDs and paths', async () => {
  const exec = vi.fn().mockResolvedValue({ stdout: 'ssh-user\n', stderr: '' })
  fixture.getProvider.mockReturnValue({ exec })
  for (const [hostId, username] of [
    ['local', 'native-user'],
    ['ssh:fixture', 'ssh-user']
  ]) {
    await input({ repoId: repo.id, hostId })
    await WORKSPACE_REPO_USERNAME_HANDLERS['repo git-username-for-host'](ctx)
    expect(lastResult()).toBe(username)
  }
  expect(fixture.getProvider).toHaveBeenCalledExactlyOnceWith('fixture')
  expect(exec).toHaveBeenCalledExactlyOnceWith(['config', '--get', 'github.user'], directory)
})

it('keeps folder and disconnected SSH unknown results without a native account fallback', async () => {
  store.addRepo({ ...repo, id: 'folder', kind: 'folder' })
  for (const params of [
    { repoId: 'folder', hostId: 'local' },
    { repoId: repo.id, hostId: 'ssh:fixture' }
  ]) {
    await input(params)
    await WORKSPACE_REPO_USERNAME_HANDLERS['repo git-username-for-host'](ctx)
    expect(lastResult()).toBe('')
  }
  expect(fixture.getProvider).toHaveBeenCalledExactlyOnceWith('fixture')
})

it('rejects absent host input or selection before invoking a provider', async () => {
  await input({ repoId: repo.id })
  await expect(
    WORKSPACE_REPO_USERNAME_HANDLERS['repo git-username-for-host'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await input({ repoId: repo.id, hostId: 'ssh:absent' })
  await expect(
    WORKSPACE_REPO_USERNAME_HANDLERS['repo git-username-for-host'](ctx)
  ).rejects.toMatchObject({ code: 'selector_not_found' })
  expect(fixture.getProvider).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})

it('refuses WSL and other runtime owners before using the native login cache', async () => {
  store.addRepo({ ...repo, id: 'wsl', path: String.raw`\\wsl.localhost\Ubuntu\home\user\repo` })
  await input({ repoId: 'wsl', hostId: 'local' })
  await expect(WORKSPACE_REPO_USERNAME_HANDLERS['repo git-username-for-host'](ctx)).rejects.toThrow(
    'Select the owning Git environment.'
  )
  await input({ repoId: repo.id, hostId: 'runtime:other' })
  await expect(WORKSPACE_REPO_USERNAME_HANDLERS['repo git-username-for-host'](ctx)).rejects.toThrow(
    'Select the owning Git environment.'
  )
  expect(fixture.getProvider).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})

it('fails on an absent service or old peer without reading client Git config', async () => {
  setRepoGitUsernameReaderForRpc(null)
  await input({ repoId: repo.id, hostId: 'local' })
  await expect(
    WORKSPACE_REPO_USERNAME_HANDLERS['repo git-username-for-host'](ctx)
  ).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(
    WORKSPACE_REPO_USERNAME_HANDLERS['repo git-username-for-host'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(console.log).not.toHaveBeenCalled()
})
