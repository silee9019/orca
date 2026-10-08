import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile,
  access,
  realpath,
  stat,
  readdir
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { track } from '../../src/main/telemetry/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
const fixture = vi.hoisted(() => ({
  connected: true,
  gitCheck: vi.fn(),
  gitExec: vi.fn(),
  failCommit: false,
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
  getSshGitProvider: () =>
    fixture.connected
      ? {
          isGitRepoAsync: fixture.gitCheck,
          exec: fixture.gitExec,
          getHostPlatform: () => ({ os: 'linux', pathFlavor: 'posix' })
        }
      : undefined
}))
vi.mock('../../src/main/ssh/ssh-target-registry', () => ({
  getActiveMultiplexer: () =>
    fixture.connected ? { request: fixture.muxRequest, notify: fixture.muxNotify } : undefined
}))
vi.mock('../../src/main/ipc/repos/repos-changed-notification', () => ({
  notifyReposChanged: fixture.notify
}))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: () =>
    fixture.connected
      ? {
          stat,
          readDir: readdir,
          createDirNoClobber: (path: string) => mkdir(path),
          deletePath: (path: string) => rm(path, { recursive: true })
        }
      : undefined
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { runProcess } from '../../src/shared/child-process/run-process'
import { registerDesktopRepoCreateRemoteHandlers } from '../../src/main/repo-desktop-create-remote-handlers'
import {
  WORKSPACE_REPO_CREATE_REMOTE_METHODS,
  setDesktopRepoCreateRemoteForRpc
} from '../../src/main/runtime/rpc/methods/workspace-repo-create-remote'
import { WORKSPACE_REPO_CREATE_REMOTE_HANDLERS } from '../../src/cli/handlers/workspace-repo-create-remote'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-repo-create-remote-')))
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
  fixture.gitCheck
    .mockReset()
    .mockImplementation(async (path: string) => ({ isRepo: true, rootPath: path }))
  fixture.failCommit = false
  fixture.gitExec.mockReset().mockImplementation(async (args: string[], cwd: string) => {
    if (fixture.failCommit && args[0] === 'commit') {
      throw new Error('user.email private-account@example.invalid')
    }
    const result = await git(args, cwd)
    return result.stdout
  })
  fixture.muxRequest.mockReset().mockResolvedValue({ resolvedPath: directory })
  fixture.muxNotify.mockClear()
  fixture.notify.mockClear()
  vi.mocked(track).mockClear()
  vi.mocked(ipcMain.handle).mockClear()
  registerDesktopRepoCreateRemoteHandlers(new BrowserWindow(), store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_REPO_CREATE_REMOTE_METHODS
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
  setDesktopRepoCreateRemoteForRpc(null)
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
  await WORKSPACE_REPO_CREATE_REMOTE_HANDLERS[`repo ${command}`](ctx)
  const text = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof text !== 'string') {
    throw new Error('Missing fixture output')
  }
  return JSON.parse(text).result
}
async function git(args: string[], cwd = directory) {
  const result = await runProcess({
    program: 'git',
    args: [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      ...args
    ],
    cwd,
    timeoutMs: 10000,
    maxOutputBytes: 100000
  })
  expect(result.code, result.stderr).toBe(0)
  return result
}
function args(name: string, kind = 'folder') {
  return {
    connectionId: 'fixture',
    parentPath: directory,
    name,
    kind,
    expectedExecutionHostId: 'local'
  }
}
function confirm(name: string) {
  return `fixture:${directory}:${name}`
}
it('creates a real fixture-host folder, registers it once per host and keeps picker telemetry out of CLI', async () => {
  const first = await invoke('create-desktop-remote', args('folder'), confirm('folder'))
  expect(first.repo).toMatchObject({
    path: join(directory, 'folder'),
    kind: 'folder',
    connectionId: 'fixture',
    executionHostId: 'ssh:fixture'
  })
  await access(first.repo.path)
  const again = await invoke('create-desktop-remote', args('folder'), confirm('folder'))
  expect(again.repo.id).toBe(first.repo.id)
  const other = await invoke(
    'create-desktop-remote',
    { ...args('folder'), connectionId: 'other' },
    `other:${directory}:folder`
  )
  expect(other.repo.id).not.toBe(first.repo.id)
  expect(store.getRepos()).toHaveLength(2)
  expect(fixture.notify).toHaveBeenCalledTimes(3)
  expect(vi.mocked(track).mock.calls.some(([event]) => event === 'repo_added')).toBe(false)
  await store.flushAsync()
})
it('runs original Git init and initial commit through the selected provider', async () => {
  const result = await invoke('create-desktop-remote', args('git', 'git'), confirm('git'))
  expect(result.repo.kind).toBe('git')
  expect(fixture.gitExec).toHaveBeenCalledWith(['init'], join(directory, 'git'))
  expect(fixture.gitExec).toHaveBeenCalledWith(
    ['commit', '--allow-empty', '-m', 'Initial commit'],
    join(directory, 'git')
  )
  expect((await git(['rev-list', '--count', 'HEAD'], result.repo.path)).stdout.trim()).toBe('1')
})
it('protects existing content and cleans only the original service failed creation target', async () => {
  const full = join(directory, 'full')
  await mkdir(full)
  await writeFile(join(full, 'keep.txt'), 'keep')
  await expect(invoke('create-desktop-remote', args('full'), confirm('full'))).rejects.toThrow(
    /creation failed/
  )
  expect(await readFile(join(full, 'keep.txt'), 'utf8')).toBe('keep')
  fixture.failCommit = true
  await expect(
    invoke('create-desktop-remote', args('failed', 'git'), confirm('failed'))
  ).rejects.toThrow(/creation failed/)
  await expect(access(join(directory, 'failed'))).rejects.toThrow()
  const empty = join(directory, 'empty')
  await mkdir(empty)
  await expect(
    invoke('create-desktop-remote', args('empty', 'git'), confirm('empty'))
  ).rejects.toThrow(/creation failed/)
  await access(empty)
  await expect(access(join(empty, '.git'))).rejects.toThrow()
  expect(store.getRepos()).toHaveLength(0)
  expect(console.log).not.toHaveBeenCalled()
})
it('refuses disconnected targets, relative parents, traversal and mismatched confirmation without local fallback', async () => {
  await expect(invoke('create-desktop-remote', args('blocked'), 'wrong')).rejects.toThrow()
  expect(ctx.client.call).not.toHaveBeenCalled()
  await expect(
    invoke('create-desktop-remote', args('../escape'), confirm('../escape'))
  ).rejects.toThrow()
  await expect(
    invoke(
      'create-desktop-remote',
      { ...args('relative'), parentPath: 'relative' },
      'fixture:relative:relative'
    )
  ).rejects.toThrow()
  fixture.connected = false
  await expect(
    invoke('create-desktop-remote', args('disconnected'), confirm('disconnected'))
  ).rejects.toThrow(/creation failed/)
  await expect(access(join(directory, 'disconnected'))).rejects.toThrow()
  expect(store.getRepos()).toHaveLength(0)
  expect(fixture.gitExec).not.toHaveBeenCalled()
})
it('preserves the original IPC result, notification and folder-picker telemetry', async () => {
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'repos:createRemote')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC callback')
  }
  const result = await Reflect.apply(callback, undefined, [undefined, args('ui')])
  expect(result.repo.path).toBe(join(directory, 'ui'))
  expect(track).toHaveBeenCalledWith(
    'repo_added',
    expect.objectContaining({ method: 'folder_picker' })
  )
  expect(fixture.notify).toHaveBeenCalledTimes(1)
})
it('fails explicitly for unavailable desktop services and old peers without success output', async () => {
  setDesktopRepoCreateRemoteForRpc(null)
  await expect(
    invoke('create-desktop-remote', args('absent'), confirm('absent'))
  ).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('create-desktop-remote', args('old'), confirm('old'))).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(console.log).not.toHaveBeenCalled()
})

it('resolves the supplied remote home on the selected target before creating', async () => {
  const result = await invoke(
    'create-desktop-remote',
    { ...args('home-child'), parentPath: '~' },
    'fixture:~:home-child'
  )
  expect(result.repo.path).toBe(join(directory, 'home-child'))
  expect(fixture.muxRequest).toHaveBeenCalledWith('session.resolveHome', { path: '~' })
})
