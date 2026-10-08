import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, mkdir, rm, writeFile, readFile, access, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { track } from '../../src/main/telemetry/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
const fixture = vi.hoisted(() => ({
  connected: true,
  gitCheck: vi.fn(),
  muxRequest: vi.fn(),
  muxNotify: vi.fn(),
  notify: vi.fn()
}))
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
vi.mock('../../src/main/repo-icon-autodetect', () => ({
  detectRepoIconAndUpstream: async () => ({})
}))
vi.mock('../../src/main/providers/ssh-git-dispatch', () => ({
  getSshGitProvider: () => (fixture.connected ? { isGitRepoAsync: fixture.gitCheck } : undefined)
}))
vi.mock('../../src/main/ssh/ssh-target-registry', () => ({
  getActiveMultiplexer: () =>
    fixture.connected ? { request: fixture.muxRequest, notify: fixture.muxNotify } : undefined
}))
vi.mock('../../src/main/ipc/repos/repos-changed-notification', () => ({
  notifyReposChanged: fixture.notify
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { runProcess } from '../../src/shared/child-process/run-process'
import { registerDesktopRepoAddHandlers } from '../../src/main/repo-desktop-add-handlers'
import {
  WORKSPACE_REPO_ADD_METHODS,
  setDesktopRepoAddForRpc
} from '../../src/main/runtime/rpc/methods/workspace-repo-add'
import { WORKSPACE_REPO_ADD_HANDLERS } from '../../src/cli/handlers/workspace-repo-add'
import {
  computeWorkspaceRootAsync,
  getWorktreePathSettings
} from '../../src/main/ipc/worktree-logic'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-repo-add-')))
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
  store.updateSettings({ workspaceDir: join(directory, 'workspaces'), nestWorkspaces: false })
  fixture.connected = true
  fixture.gitCheck.mockReset().mockResolvedValue({ isRepo: true, rootPath: '/host/repo' })
  fixture.muxRequest.mockReset().mockResolvedValue({ resolvedPath: '/host/home' })
  fixture.muxNotify.mockClear()
  fixture.notify.mockClear()
  vi.mocked(track).mockClear()
  vi.mocked(ipcMain.handle).mockClear()
  registerDesktopRepoAddHandlers(new BrowserWindow(), store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_REPO_ADD_METHODS
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
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  setDesktopRepoAddForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
async function invoke(command: string, params: object, confirm: string) {
  const input = join(directory, 'input.json')
  await writeFile(input, JSON.stringify(params))
  ctx.flags.set('params-file', input)
  ctx.flags.delete('confirm')
  if (confirm) {
    ctx.flags.set('confirm', confirm)
  }
  await WORKSPACE_REPO_ADD_HANDLERS[`repo ${command}`](ctx)
  const text = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof text !== 'string') {
    throw new Error('Missing fixture output')
  }
  return JSON.parse(text).result
}
async function git(args: string[], cwd = directory) {
  const result = await runProcess({
    program: 'git',
    args: ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
    cwd,
    timeoutMs: 10000,
    maxOutputBytes: 100000
  })
  expect(result.code, result.stderr).toBe(0)
}
it('registers a real Git subdirectory once, prepares its private workspace root, and keeps files and linked-worktree dedup', async () => {
  const path = join(directory, 'repo')
  await mkdir(path)
  await git(['init', path])
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
    path
  )
  const nested = join(path, 'nested')
  await mkdir(nested)
  await writeFile(join(nested, 'keep.txt'), 'keep')
  const first = await invoke(
    'add-desktop-local',
    { path: nested, expectedExecutionHostId: 'local' },
    nested
  )
  expect(first.repo.path).toBe(path)
  expect(first.repo.projectHostSetupMethod).toBe('imported-existing-folder')
  const root = await computeWorkspaceRootAsync(
    path,
    getWorktreePathSettings(first.repo, store.getSettings())
  )
  expect(root.startsWith(directory)).toBe(true)
  await access(root)
  await rm(root, { recursive: true, force: true })
  const same = await invoke(
    'add-desktop-local',
    { path: nested, expectedExecutionHostId: 'local' },
    nested
  )
  expect(same.repo.id).toBe(first.repo.id)
  await access(root)
  const linked = join(directory, 'linked')
  await git(['worktree', 'add', '-b', 'linked', linked, 'HEAD'], path)
  const dedup = await invoke(
    'add-desktop-local',
    { path: linked, expectedExecutionHostId: 'local' },
    linked
  )
  expect(dedup.repo.id).toBe(first.repo.id)
  expect(store.getRepos()).toHaveLength(1)
  expect(await readFile(join(nested, 'keep.txt'), 'utf8')).toBe('keep')
  await store.flushAsync()
})
it('registers an existing local folder and rejects invalid local input before registration', async () => {
  const path = join(directory, 'folder')
  await mkdir(path)
  const result = await invoke(
    'add-desktop-local',
    { path, kind: 'folder', expectedExecutionHostId: 'local' },
    path
  )
  expect(result.repo.kind).toBe('folder')
  expect(vi.mocked(track).mock.calls.some(([event]) => event === 'repo_added')).toBe(false)
  const count = store.getRepos().length
  await expect(
    invoke(
      'add-desktop-local',
      { path: join(directory, 'absent'), kind: 'folder', expectedExecutionHostId: 'local' },
      join(directory, 'absent')
    )
  ).rejects.toThrow()
  await expect(
    invoke('add-desktop-local', { path, expectedExecutionHostId: 'local' }, path)
  ).rejects.toThrow(/registration failed/)
  expect(store.getRepos()).toHaveLength(count)
})
it('resolves a remote home through the selected provider, deduplicates within its host and refuses a disconnected host without a local fallback', async () => {
  const args = {
    connectionId: 'fixture',
    remotePath: '~',
    kind: 'folder',
    expectedExecutionHostId: 'local'
  }
  const first = await invoke('add-desktop-remote', args, '~')
  expect(first.repo).toMatchObject({
    path: '/host/home',
    connectionId: 'fixture',
    executionHostId: 'ssh:fixture',
    kind: 'folder'
  })
  expect(fixture.muxRequest).toHaveBeenCalledWith('session.resolveHome', { path: '~' })
  expect(fixture.muxNotify).toHaveBeenCalledWith('session.registerRoot', { rootPath: '/host/home' })
  const again = await invoke('add-desktop-remote', args, '~')
  expect(again.repo.id).toBe(first.repo.id)
  const other = await invoke('add-desktop-remote', { ...args, connectionId: 'other' }, '~')
  expect(other.repo.id).not.toBe(first.repo.id)
  fixture.connected = false
  await expect(
    invoke(
      'add-desktop-remote',
      { ...args, connectionId: 'unavailable', remotePath: directory },
      directory
    )
  ).rejects.toThrow(/registration failed/)
  expect(store.getRepos()).toHaveLength(2)
  expect(store.getRepos().every((repo) => repo.connectionId)).toBe(true)
})
it('rejects missing confirmation, unavailable desktop services and old peers explicitly', async () => {
  const args = { path: directory, kind: 'folder', expectedExecutionHostId: 'local' }
  await expect(invoke('add-desktop-local', args, '')).rejects.toThrow()
  expect(ctx.client.call).not.toHaveBeenCalled()
  setDesktopRepoAddForRpc(null)
  await expect(invoke('add-desktop-local', args, directory)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('add-desktop-local', args, directory)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(console.log).not.toHaveBeenCalled()
})

it('preserves the original picker IPC result and picker telemetry while the CLI avoids that attribution', async () => {
  const path = join(directory, 'ui-folder')
  await mkdir(path)
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'repos:add')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC fixture callback')
  }
  const result = await Reflect.apply(callback, undefined, [undefined, { path, kind: 'folder' }])
  expect(result.repo.kind).toBe('folder')
  expect(track).toHaveBeenCalledWith(
    'repo_added',
    expect.objectContaining({ method: 'folder_picker' })
  )
})
