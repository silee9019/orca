import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow } from 'electron'
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
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_DESKTOP_META_HANDLERS } from '../../src/cli/handlers/workspace-desktop-meta'
import {
  WORKSPACE_DESKTOP_META_METHODS,
  setDesktopWorktreeMetadataForRpc
} from '../../src/main/runtime/rpc/methods/workspace-desktop-meta'
import { registerWorktreeMetadataHandlers } from '../../src/main/ipc/worktrees/metadata/register-worktree-metadata-handlers'
import { getFolderWorkspaceRootId } from '../../src/main/ipc/worktrees/folder-workspace-model'

let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let repo: Repo
let rootId: string
let runtime: OrcaRuntimeService
async function input(value: unknown) {
  await writeFile(join(directory, 'input.json'), JSON.stringify(value))
  ctx.flags.set('params-file', 'input.json')
}
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-desktop-meta-cli-'))
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
  runtime = new OrcaRuntimeService(store)
  vi.spyOn(runtime, 'notifyWorktreesChangedForRemoteClients').mockImplementation(() => {})
  registerWorktreeMetadataHandlers({ store, runtime, mainWindow: new BrowserWindow() })
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_DESKTOP_META_METHODS
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
  setDesktopWorktreeMetadataForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('updates only the explicit host, pins a label and persists before acknowledging', async () => {
  await input({
    worktreeId: rootId,
    executionHostId: 'ssh:fixture',
    updates: { displayName: 'Renamed', comment: '' }
  })
  ctx.flags.set('confirm', rootId)
  await WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  expect(lastResult()).toMatchObject({
    updated: true,
    worktreeId: rootId,
    executionHostId: 'ssh:fixture'
  })
  expect(store.getWorktreeMetaForHost(rootId, 'local')).toMatchObject({ displayName: 'Local only' })
  expect(store.getWorktreeMetaForHost(rootId, 'ssh:fixture')).toMatchObject({
    displayName: 'Renamed',
    comment: '',
    displayNameIsPinned: true,
    pendingFirstAgentMessageRename: false,
    firstAgentMessageRenameError: null
  })
  expect(runtime.notifyWorktreesChangedForRemoteClients).toHaveBeenCalledExactlyOnceWith(repo.id)
  const disk = readProfileStateDomain(
    join(directory, 'profile.db'),
    'fixture',
    'worktreeMetaByIdentity'
  )
  expect(JSON.stringify(disk)).toContain('Renamed')
  expect(JSON.stringify(disk)).not.toContain('Remote only')
})

it('clears a label, preserves empty comments and avoids rename notification for unread updates', async () => {
  ctx.flags.set('confirm', rootId)
  await input({ worktreeId: rootId, executionHostId: 'local', updates: { displayName: '' } })
  await WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  expect(store.getWorktreeMetaForHost(rootId, 'local')).toMatchObject({
    displayName: '',
    displayNameIsPinned: false
  })
  vi.mocked(runtime.notifyWorktreesChangedForRemoteClients).mockClear()
  await input({
    worktreeId: rootId,
    executionHostId: 'local',
    updates: { isUnread: true, comment: '' }
  })
  await WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  expect(store.getWorktreeMetaForHost(rootId, 'local')).toMatchObject({
    isUnread: true,
    comment: ''
  })
  expect(runtime.notifyWorktreesChangedForRemoteClients).not.toHaveBeenCalled()
})

it('rejects missing confirmation, an absent host, provenance and unchecked review state', async () => {
  await input({ worktreeId: rootId, executionHostId: 'local', updates: { comment: 'No write' } })
  await expect(
    WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(ctx.client.call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', rootId)
  for (const updates of [
    { orcaCreationSource: 'cli' },
    { mobileDiffReview: { version: 2, files: {} } },
    { pushTarget: null },
    { hostId: 'ssh:fixture' }
  ]) {
    await input({ worktreeId: rootId, executionHostId: 'local', updates })
    await expect(
      WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
    ).rejects.toMatchObject({ code: 'invalid_argument' })
  }
  expect(ctx.client.call).not.toHaveBeenCalled()
  await input({
    worktreeId: rootId,
    executionHostId: 'ssh:absent',
    updates: { comment: 'No write' }
  })
  await expect(
    WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  ).rejects.toMatchObject({ code: 'selector_not_found' })
  expect(store.getWorktreeMetaForHost(rootId, 'local')?.comment).not.toBe('No write')
  expect(console.log).not.toHaveBeenCalled()
})

it('reports write failure and old or unavailable services without success output', async () => {
  ctx.flags.set('confirm', rootId)
  await input({
    worktreeId: rootId,
    executionHostId: 'local',
    updates: { comment: 'Changed in memory' }
  })
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValueOnce(new Error('private-canary'))
  await expect(
    WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  ).rejects.toThrow('Desktop workspace metadata update failed.')
  expect(console.log).not.toHaveBeenCalled()
  setDesktopWorktreeMetadataForRpc(null)
  await expect(
    WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  ).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(
    WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(console.log).not.toHaveBeenCalled()
})

it('preserves checked review metadata without printing its private text', async () => {
  const updates = {
    diffComments: [
      {
        id: 'note',
        worktreeId: rootId,
        filePath: 'notes.md',
        lineNumber: 1,
        body: 'private-review-canary',
        createdAt: 1,
        side: 'modified'
      }
    ],
    mobileDiffReview: {
      version: 1,
      files: { note: { key: 'note', filePath: 'notes.md', scope: 'branch', reviewedAt: 2 } }
    },
    linkedWorkItem: null,
    linkedTaskSourceContext: null,
    pushTarget: { remoteName: 'origin', branchName: 'feature' }
  }
  await input({ worktreeId: rootId, executionHostId: 'local', updates })
  ctx.flags.set('confirm', rootId)
  await WORKSPACE_DESKTOP_META_HANDLERS['worktree update-desktop-meta'](ctx)
  expect(store.getWorktreeMetaForHost(rootId, 'local')).toMatchObject(updates)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-review-canary')
  expect(runtime.notifyWorktreesChangedForRemoteClients).not.toHaveBeenCalled()
})
