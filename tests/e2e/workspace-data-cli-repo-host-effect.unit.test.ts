import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as appEnvironment from '../../src/shared/app-environment'
import type { HandlerContext } from '../../src/cli/dispatch'
import type { Repo } from '../../src/shared/repo-types'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { REPO_METHODS } from '../../src/main/runtime/rpc/methods/repo'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_REPO_DATA_HANDLERS } from '../../src/cli/handlers/workspace-repo-data'
import { REPO_HANDLERS } from '../../src/cli/handlers/repo'
import { getDefaultWorkspaceDir } from '../../src/shared/constants'
import * as usernames from '../../src/main/repo-git-username-enrichment'
import * as identities from '../../src/main/repo-git-remote-identity-enrichment'

vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/ipc/filesystem-auth', () => ({ invalidateAuthorizedRootsCache: vi.fn() }))

let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let runtime: OrcaRuntimeService
let ctx: HandlerContext
let dispatcher: RpcDispatcher
let unsubscribe = () => {}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-repo-host-'))
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
  const repo: Repo = {
    id: 'shared',
    path: join(directory, 'folder'),
    displayName: 'Local',
    badgeColor: 'blue',
    addedAt: 1,
    kind: 'folder'
  }
  store.addRepo(repo)
  store.addRepo({ ...repo, connectionId: 'fixture', path: '/remote/folder', displayName: 'Remote' })
  store.addRepo({ ...repo, id: 'remote-2', connectionId: 'fixture', path: '/remote/second' })
  expect(store.getRepos()).toHaveLength(3)
  runtime = new OrcaRuntimeService(store)
  dispatcher = new RpcDispatcher({ runtime, methods: REPO_METHODS })
  const client = new RuntimeClient(join(directory, 'client-home'))
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
  ctx = {
    client,
    cwd: directory,
    json: true,
    flags: new Map([['params-file', join(directory, 'input.json')]])
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  unsubscribe()
  store.freezeWrites()
  await store.flushAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('reports rejected existing reorder as a failed command without changing storage', async () => {
  const before = store.getRepos()
  await writeFile(join(directory, 'input.json'), JSON.stringify({ orderedIds: ['shared'] }))
  await expect(WORKSPACE_REPO_DATA_HANDLERS['repo reorder'](ctx)).rejects.toMatchObject({
    code: 'operation_failed'
  })
  expect(store.getRepos()).toEqual(before)
})

it('keeps background username enrichment and its host notification on the existing list command', async () => {
  store.updateRepo('shared', { kind: 'git' })
  vi.spyOn(identities, 'enrichMissingRepoGitRemoteIdentities').mockImplementation(() => {})
  const enrich = vi
    .spyOn(usernames, 'enrichRepoGitUsernames')
    .mockImplementation((profile, options) => {
      profile.setResolvedRepoGitUsername(profile.getRepos()[0], 'fixture-user')
      options?.onChanged?.()
    })
  const changed = vi.fn()
  unsubscribe = runtime.onClientEvent(changed, { consumesTerminalSideEffects: false })
  await REPO_HANDLERS['repo list'](ctx)
  expect(enrich).toHaveBeenCalledTimes(1)
  expect(store.getRepos()[0].gitUsername).toBe('fixture-user')
  expect(store.getRepos()[1].gitUsername).toBe('')
  expect(changed).toHaveBeenCalledExactlyOnceWith({ type: 'reposChanged' })
})

it('reads native project creation defaults from the selected runtime settings', async () => {
  dispatcher = new RpcDispatcher({
    runtime,
    methods: (await import('../../src/main/runtime/rpc/methods/workspace-repo-host'))
      .WORKSPACE_REPO_HOST_METHODS
  })
  store.updateSettings({ workspaceDir: '/fixture/custom-parent' })
  await WORKSPACE_REPO_DATA_HANDLERS['repo default-project-parent'](ctx)
  expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('/fixture/custom-parent'))
  store.updateSettings({
    hostSettingOverrides: { local: { defaultWorktreeLocation: '/fixture/override' } }
  })
  await WORKSPACE_REPO_DATA_HANDLERS['repo default-project-parent'](ctx)
  expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('/fixture/override'))
  store.updateSettings({ hostSettingOverrides: {} })
  store.updateSettings({ workspaceDir: getDefaultWorkspaceDir(homedir()) })
  await WORKSPACE_REPO_DATA_HANDLERS['repo default-project-parent'](ctx)
  expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0]).result).toBe(
    join(homedir(), 'orca', 'projects')
  )
})

it('reorders and forgets only the named host while preserving the same repo ID elsewhere', async () => {
  const changed = vi.fn()
  unsubscribe = runtime.onClientEvent(changed, { consumesTerminalSideEffects: false })
  const { WORKSPACE_REPO_HOST_METHODS } =
    await import('../../src/main/runtime/rpc/methods/workspace-repo-host')
  dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_REPO_HOST_METHODS })
  const input = join(directory, 'input.json')
  await writeFile(
    input,
    JSON.stringify({ hostId: 'ssh:fixture', orderedIds: ['remote-2', 'shared'] })
  )
  await WORKSPACE_REPO_DATA_HANDLERS['repo reorder-for-host'](ctx)
  expect(changed).toHaveBeenCalledExactlyOnceWith({ type: 'reposChanged' })
  expect(store.getRepos().map((repo) => [repo.id, repo.connectionId ?? null])).toEqual([
    ['shared', null],
    ['remote-2', 'fixture'],
    ['shared', 'fixture']
  ])
  const reordered = store.getRepos()
  await writeFile(input, JSON.stringify({ hostId: 'ssh:fixture', orderedIds: ['shared'] }))
  await expect(WORKSPACE_REPO_DATA_HANDLERS['repo reorder-for-host'](ctx)).rejects.toMatchObject({
    code: 'operation_failed'
  })
  expect(store.getRepos()).toEqual(reordered)
  expect(changed).toHaveBeenCalledTimes(1)
  await writeFile(input, JSON.stringify({ hostId: 'ssh:fixture', repoId: 'shared' }))
  await expect(WORKSPACE_REPO_DATA_HANDLERS['repo remove-for-host'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  ctx.flags.set('confirm', 'ssh:fixture:shared')
  await WORKSPACE_REPO_DATA_HANDLERS['repo remove-for-host'](ctx)
  expect(changed).toHaveBeenCalledTimes(2)
  expect(store.getRepos().map((repo) => [repo.id, repo.connectionId ?? null])).toEqual([
    ['shared', null],
    ['remote-2', 'fixture']
  ])
  store.flushOrThrow()
  expect(
    readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'projectHostSetups')
  ).toEqual({
    kind: 'value',
    value: store.getProjectHostSetups()
  })
  const beforeInvalid = vi.mocked(ctx.client.call).mock.calls.length
  await writeFile(input, JSON.stringify({ hostId: 'invalid', repoId: 'shared' }))
  await expect(WORKSPACE_REPO_DATA_HANDLERS['repo remove-for-host'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).toHaveBeenCalledTimes(beforeInvalid)
  await writeFile(input, JSON.stringify({ hostId: 'ssh:fixture', repoId: 'shared' }))
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(WORKSPACE_REPO_DATA_HANDLERS['repo remove-for-host'](ctx)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(ctx.client.call).toHaveBeenCalledTimes(beforeInvalid + 1)
})
