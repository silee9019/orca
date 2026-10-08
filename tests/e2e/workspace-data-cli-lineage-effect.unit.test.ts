import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow, ipcMain } from 'electron'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type { z } from 'zod'
import type { DesktopWorktreeLineageUpdate } from '../../src/shared/rpc-contract/workspace-lineage-params'
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: class {
    isDestroyed() {
      return false
    }
    webContents = { send: vi.fn() }
  }
}))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { runProcess } from '../../src/shared/child-process/run-process'
import { worktreeWorkspaceKey } from '../../src/shared/workspace-scope'
import { WORKSPACE_LINEAGE_HANDLERS } from '../../src/cli/handlers/workspace-lineage'
import {
  WORKSPACE_LINEAGE_METHODS,
  setDesktopLineageForRpc
} from '../../src/main/runtime/rpc/methods/workspace-lineage'
import { registerWorktreeMetadataHandlers } from '../../src/main/ipc/worktrees/metadata/register-worktree-metadata-handlers'
type Params = z.infer<typeof DesktopWorktreeLineageUpdate>
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let runtime: OrcaRuntimeService
let window: BrowserWindow
let ctx: HandlerContext
let child: Params['target']
let parent: Params['target']
async function git(args: string[], cwd: string) {
  const result = await runProcess({
    program: 'git',
    args: ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
    cwd,
    timeoutMs: 10000,
    maxOutputBytes: 100000
  })
  expect(result.code, result.stderr).toBe(0)
}
async function invoke(params: unknown, confirm = child.identityKey) {
  await writeFile(join(directory, 'input.json'), JSON.stringify(params))
  ctx.flags.set('params-file', 'input.json')
  ctx.flags.delete('confirm')
  if (confirm) {
    ctx.flags.set('confirm', confirm)
  }
  await WORKSPACE_LINEAGE_HANDLERS['worktree update-desktop-lineage'](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-lineage-')))
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
  const repoPath = join(directory, 'repo')
  const childPath = join(directory, 'child')
  await mkdir(repoPath)
  await git(['init'], repoPath)
  await git(
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'Fixture'
    ],
    repoPath
  )
  await git(['worktree', 'add', '-b', 'child', childPath], repoPath)
  store.addRepo({
    id: 'fixture',
    path: repoPath,
    displayName: 'Fixture',
    badgeColor: 'blue',
    addedAt: 1
  })
  runtime = new OrcaRuntimeService(store)
  vi.spyOn(runtime, 'notifyWorktreesChangedForRemoteClients').mockImplementation(() => {})
  const toTarget = async (path: string) => {
    const worktree = await runtime.showManagedWorktree(`path:${path}`)
    if (!worktree.identity) {
      throw new Error('Missing fixture instance identity')
    }
    return {
      worktreeId: worktree.id,
      executionHostId: worktree.identity.executionHostId,
      identityKey: worktree.identity.key
    }
  }
  child = await toTarget(childPath)
  parent = await toTarget(repoPath)
  window = new BrowserWindow()
  vi.mocked(ipcMain.handle).mockClear()
  registerWorktreeMetadataHandlers({ store, runtime, mainWindow: window })
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_LINEAGE_METHODS })
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
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  setDesktopLineageForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
it('records and clears actual Git worktree lineage in SQLite before acknowledgement', async () => {
  expect(await invoke({ target: child, parent })).toMatchObject({
    updated: true,
    worktreeId: child.worktreeId,
    lineage: { parentWorktreeId: parent.worktreeId, origin: 'manual' }
  })
  expect(store.getWorktreeLineage(child.worktreeId)?.parentWorktreeId).toBe(parent.worktreeId)
  expect(
    store.getWorkspaceLineage(worktreeWorkspaceKey(child.worktreeId))?.parentWorkspaceKey
  ).toBe(worktreeWorkspaceKey(parent.worktreeId))
  expect(
    JSON.stringify(
      readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'worktreeLineageById')
    )
  ).toContain(parent.worktreeId)
  expect(window.webContents.send).toHaveBeenCalled()
  expect(await invoke({ target: child, noParent: true })).toMatchObject({
    updated: true,
    lineage: null
  })
  expect(store.getWorktreeLineage(child.worktreeId)).toBeUndefined()
  expect(store.getWorkspaceLineage(worktreeWorkspaceKey(child.worktreeId))).toBeUndefined()
  expect(
    JSON.stringify(
      readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'worktreeLineageById')
    )
  ).not.toContain(child.worktreeId)
})
it('rejects cycles, wrong host, stale identity and ambiguous repository owners without changing an edge', async () => {
  await invoke({ target: child, parent })
  await expect(invoke({ target: parent, parent: child }, parent.identityKey)).rejects.toThrow()
  await expect(
    invoke({ target: { ...child, executionHostId: 'ssh:absent' }, noParent: true })
  ).rejects.toThrow()
  await expect(
    invoke(
      { target: { ...child, identityKey: 'stale-instance' }, noParent: true },
      'stale-instance'
    )
  ).rejects.toThrow()
  await expect(
    invoke({ target: { ...child, worktreeId: parent.worktreeId }, noParent: true })
  ).rejects.toThrow()
  await expect(
    invoke({ target: child, parent: { ...parent, executionHostId: 'ssh:absent' } })
  ).rejects.toThrow()
  store.addRepo({ ...store.getRepos()[0], connectionId: 'fixture' })
  await expect(invoke({ target: child, noParent: true })).rejects.toThrow()
  expect(store.getWorktreeLineage(child.worktreeId)?.parentWorktreeId).toBe(parent.worktreeId)
})
it('preserves a stale edge belonging to a different child instance', async () => {
  await invoke({ target: child, parent })
  const edge = store.getWorktreeLineage(child.worktreeId)!
  store.setWorktreeLineage(child.worktreeId, { ...edge, worktreeInstanceId: 'replaced-instance' })
  await expect(invoke({ target: child, noParent: true })).rejects.toThrow()
  expect(store.getWorktreeLineage(child.worktreeId)?.worktreeInstanceId).toBe('replaced-instance')
})
it('rejects a folder workspace without a resolvable instance identity and preserves its metadata', async () => {
  const path = join(directory, 'folder')
  await mkdir(path)
  store.addRepo({
    id: 'folder',
    path,
    kind: 'folder',
    displayName: 'Folder',
    badgeColor: 'blue',
    addedAt: 1
  })
  const folder = await runtime.showManagedWorktree(`path:${path}`)
  expect(folder.identity).toBeUndefined()
  const before = store.getWorktreeMetaForHost(folder.id, 'local')
  const target = {
    worktreeId: folder.id,
    identityKey: `unresolved-folder:${folder.instanceId}`,
    executionHostId: 'local'
  }
  await expect(invoke({ target, noParent: true }, target.identityKey)).rejects.toThrow()
  await expect(invoke({ target, parent }, target.identityKey)).rejects.toThrow()
  expect(store.getWorktreeLineage(folder.id)).toBeUndefined()
  expect(store.getWorktreeMetaForHost(folder.id, 'local')).toEqual(before)
})
it('preserves the original IPC parent and no-parent return and notification', async () => {
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'worktrees:updateLineage')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC')
  }
  expect(
    await Reflect.apply(callback, undefined, [
      {},
      { worktreeId: child.worktreeId, parentWorktreeId: parent.worktreeId }
    ])
  ).toMatchObject({ parentWorktreeId: parent.worktreeId })
  expect(window.webContents.send).toHaveBeenCalled()
  expect(
    await Reflect.apply(callback, undefined, [{}, { worktreeId: child.worktreeId, noParent: true }])
  ).toBeNull()
})
it('rejects invalid input and confirmation before RPC and reports service/save/old-peer failures without private text', async () => {
  await expect(invoke({ target: child, noParent: true }, '')).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  for (const params of [
    { target: child },
    { target: child, parent, noParent: true },
    { target: child, noParent: true, extra: 'ignored' }
  ]) {
    await expect(invoke(params)).rejects.toMatchObject({ code: 'invalid_argument' })
  }
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValueOnce(new Error('private-canary'))
  await expect(invoke({ target: child, parent })).rejects.toThrow(
    'Desktop workspace lineage update failed.'
  )
  expect(console.log).not.toHaveBeenCalled()
  setDesktopLineageForRpc(null)
  await expect(invoke({ target: child, noParent: true })).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke({ target: child, noParent: true })).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-canary')
})
