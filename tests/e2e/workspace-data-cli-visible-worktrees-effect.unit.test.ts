import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type { Repo } from '../../src/shared/repo-types'
import type * as SshGitDispatch from '../../src/main/providers/ssh-git-dispatch'

const fixture = vi.hoisted(() => ({ getProvider: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
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
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_VISIBLE_WORKTREE_HANDLERS } from '../../src/cli/handlers/workspace-visible-worktrees'
import {
  WORKSPACE_VISIBLE_WORKTREE_METHODS,
  setDesktopVisibleWorktreeCatalogForRpc
} from '../../src/main/runtime/rpc/methods/workspace-visible-worktrees'
import { registerWorktreeCatalogHandlers } from '../../src/main/ipc/worktrees/listing/register-worktree-catalog-handlers'
import {
  getFolderWorkspaceRootId,
  getFolderWorkspaceInstanceId
} from '../../src/main/ipc/worktrees/folder-workspace-model'

let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let repo: Repo
let rootId: string
async function input(value: unknown) {
  await writeFile(join(directory, 'input.json'), JSON.stringify(value))
  ctx.flags.set('params-file', 'input.json')
}
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-visible-list-cli-'))
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
  rootId = getFolderWorkspaceRootId(repo)
  store.setWorktreeMetaForHost(rootId, 'local', {
    instanceId: 'local-instance',
    displayName: 'Local only',
    hostId: 'local'
  })
  store.setWorktreeMetaForHost(rootId, 'ssh:fixture', {
    instanceId: 'remote-instance',
    displayName: 'Remote only',
    hostId: 'ssh:fixture'
  })
  registerWorktreeCatalogHandlers({ store })
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_VISIBLE_WORKTREE_METHODS
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
  setDesktopVisibleWorktreeCatalogForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('selects a folder repo host and preserves distinct metadata for the same ID and path', async () => {
  for (const [executionHostId, displayName] of [
    ['local', 'Local only'],
    ['ssh:fixture', 'Remote only']
  ]) {
    await input({ repoId: repo.id, executionHostId })
    await WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-visible'](ctx)
    expect(lastResult()).toHaveLength(1)
    expect(lastResult()[0]).toMatchObject({ id: rootId, hostId: executionHostId, displayName })
  }
  expect(fixture.getProvider).not.toHaveBeenCalled()
  await store.flushPendingOrThrowAsync()
  const disk = readProfileStateDomain(
    join(directory, 'profile.db'),
    'fixture',
    'worktreeMetaByIdentity'
  )
  expect(disk.kind).toBe('value')
  expect(JSON.stringify(disk)).toContain('Remote only')
  const locatorDisk = readProfileStateDomain(
    join(directory, 'profile.db'),
    'fixture',
    'worktreeMeta'
  )
  expect(locatorDisk.kind).toBe('value')
  expect(JSON.stringify(locatorDisk)).toContain('Local only')
  expect(store.getWorktreeMetaForHost(rootId, 'local')).toMatchObject({ displayName: 'Local only' })
  expect(store.getWorktreeMetaForHost(rootId, 'ssh:fixture')).toMatchObject({
    displayName: 'Remote only'
  })
  const reopened = new Store({
    dataFile: join(directory, 'data.json'),
    profileStateAuthority: authority
  })
  try {
    expect(reopened.getWorktreeMetaForHost(rootId, 'local')).toMatchObject({
      displayName: 'Local only',
      hostId: 'local'
    })
    expect(reopened.getWorktreeMetaForHost(rootId, 'ssh:fixture')).toMatchObject({
      displayName: 'Remote only',
      hostId: 'ssh:fixture'
    })
  } finally {
    await reopened.freezeWritesAsync()
  }
})

it('lists all visible host rows without leaking a child workspace to another host', async () => {
  const childId = getFolderWorkspaceInstanceId(repo, 'local-child')
  store.setWorktreeMetaForHost(childId, 'local', {
    instanceId: 'local-child',
    displayName: 'Local child',
    hostId: 'local'
  })
  await WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-all-visible'](ctx)
  expect(lastResult()).toHaveLength(3)
  expect(lastResult()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: rootId, hostId: 'local', displayName: 'Local only' }),
      expect.objectContaining({ id: rootId, hostId: 'ssh:fixture', displayName: 'Remote only' }),
      expect.objectContaining({ id: childId, hostId: 'local', displayName: 'Local child' })
    ])
  )
  await input({ repoId: repo.id, executionHostId: 'ssh:fixture' })
  await WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-visible'](ctx)
  expect(lastResult()).toHaveLength(1)
  expect(fixture.getProvider).not.toHaveBeenCalled()
})

it('preserves the desktop disconnected SSH metadata fallback without claiming process liveness', async () => {
  store.addRepo({
    id: 'offline',
    path: '/remote/git',
    displayName: 'Offline',
    badgeColor: 'blue',
    addedAt: 1,
    connectionId: 'offline',
    kind: 'git'
  })
  const id = 'offline::/remote/git/branch'
  store.setWorktreeMetaForHost(id, 'local', { displayName: 'Local private row', hostId: 'local' })
  store.setWorktreeMetaForHost(id, 'ssh:offline', {
    displayName: 'Remote cached row',
    hostId: 'ssh:offline'
  })
  await input({ repoId: 'offline', executionHostId: 'ssh:offline' })
  await WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-visible'](ctx)
  expect(lastResult()).toEqual([
    expect.objectContaining({ id, hostId: 'ssh:offline', displayName: 'Remote cached row' })
  ])
  expect(JSON.stringify(lastResult())).not.toContain('Local private row')
  expect(fixture.getProvider).toHaveBeenCalledExactlyOnceWith('offline')
})

it('rejects an absent explicit host and missing host input before using a provider', async () => {
  await input({ repoId: repo.id })
  await expect(
    WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-visible'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await input({ repoId: repo.id, executionHostId: 'ssh:absent' })
  await expect(
    WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-visible'](ctx)
  ).rejects.toMatchObject({ code: 'selector_not_found' })
  expect(fixture.getProvider).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})

it('refuses another runtime owner instead of executing its paths on the desktop host', async () => {
  await input({ repoId: repo.id, executionHostId: 'runtime:other' })
  await expect(WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-visible'](ctx)).rejects.toThrow(
    'Select the owning runtime.'
  )
  expect(fixture.getProvider).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})

it('fails on an unavailable desktop service or old peer without scanning the client profile', async () => {
  setDesktopVisibleWorktreeCatalogForRpc(null)
  await expect(
    WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-all-visible'](ctx)
  ).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(
    WORKSPACE_VISIBLE_WORKTREE_HANDLERS['worktree list-all-visible'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(ctx.client.call).toHaveBeenCalledTimes(2)
  expect(fixture.getProvider).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
