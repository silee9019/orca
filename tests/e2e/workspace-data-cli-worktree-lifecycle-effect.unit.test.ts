import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, access } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type { IPtyProvider } from '../../src/main/providers/pty-provider-contract'
import type { Worktree } from '../../src/shared/worktree/types'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: class {} }))
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
import { WORKTREE_METHODS } from '../../src/main/runtime/rpc/methods/worktree'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKTREE_HANDLERS } from '../../src/cli/handlers/worktree'
import { runProcess } from '../../src/shared/child-process/run-process'
import { finishAcceptedWorktreeRemoval } from '../../src/main/worktree-background-removal'

let directory: string
let repoPath: string
let store: Store
let authority: ProfileStateSqliteAuthority
let runtime: OrcaRuntimeService
let ctx: HandlerContext
let inventoryUnavailable = false
const forbiddenProviderOperation = () => {
  throw new Error('Fixture must never touch a real PTY')
}
const provider: IPtyProvider = {
  spawn: async () => forbiddenProviderOperation(),
  attach: async () => forbiddenProviderOperation(),
  write: forbiddenProviderOperation,
  writeWithSettlement: forbiddenProviderOperation,
  resize: forbiddenProviderOperation,
  shutdown: async () => forbiddenProviderOperation(),
  sendSignal: async () => forbiddenProviderOperation(),
  getCwd: async () => forbiddenProviderOperation(),
  getInitialCwd: async () => forbiddenProviderOperation(),
  clearBuffer: async () => forbiddenProviderOperation(),
  resetInputModes: async () => forbiddenProviderOperation(),
  acknowledgeDataEvent: forbiddenProviderOperation,
  hasChildProcesses: async () => forbiddenProviderOperation(),
  getForegroundProcess: async () => forbiddenProviderOperation(),
  serialize: async () => forbiddenProviderOperation(),
  revive: async () => forbiddenProviderOperation(),
  listProcesses: async () => {
    if (inventoryUnavailable) {
      throw new Error('Fixture inventory unavailable')
    }
    return []
  },
  getDefaultShell: async () => forbiddenProviderOperation(),
  getProfiles: async () => forbiddenProviderOperation(),
  onData: () => () => {},
  onReplay: () => () => {},
  onExit: () => () => {}
}
async function git(args: string[], cwd = repoPath) {
  const result = await runProcess({
    program: 'git',
    args: ['-c', `core.hooksPath=${devNull}`, '-c', 'commit.gpgsign=false', ...args],
    cwd,
    timeoutMs: 10000,
    maxOutputBytes: 100000
  })
  expect(result.code, result.stderr).toBe(0)
  return result.stdout
}
async function invoke(command: string, flags: [string, string | boolean][]) {
  ctx.flags = new Map(flags)
  await WORKTREE_HANDLERS[`worktree ${command}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
async function create(name = 'created', repo = 'fixture'): Promise<{ worktree: Worktree }> {
  return invoke('create', [
    ['repo', `id:${repo}`],
    ['name', name],
    ['base-branch', 'HEAD'],
    ['no-parent', true]
  ])
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-worktree-lifecycle-')))
  vi.stubEnv('ORCA_TERMINAL_HANDLE', '')
  vi.stubEnv('GIT_CONFIG_GLOBAL', devNull)
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
  vi.stubEnv('GIT_CONFIG_COUNT', undefined)
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
  store.updateSettings({
    workspaceDir: join(directory, 'workspaces'),
    nestWorkspaces: false,
    refreshLocalBaseRefOnWorktreeCreate: false,
    branchPrefix: 'none'
  })
  repoPath = join(directory, 'repo')
  await mkdir(repoPath)
  await git(['init'])
  await git(['config', '--local', 'core.hooksPath', devNull])
  await git(['config', '--local', 'commit.gpgsign', 'false'])
  await git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'Fixture'
  ])
  store.addRepo({
    id: 'fixture',
    path: repoPath,
    displayName: 'Fixture',
    badgeColor: 'blue',
    addedAt: 1
  })
  inventoryUnavailable = false
  runtime = new OrcaRuntimeService(store, undefined, { getLocalProvider: () => provider })
  vi.spyOn(runtime, 'notifyWorktreesChangedForRemoteClients').mockImplementation(() => {})
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKTREE_METHODS })
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
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(async () => {
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
it('creates a real Git checkout through the existing CLI/RPC and distinguishes accepted removal from completion', async () => {
  const result = await create()
  expect(result.worktree.path.startsWith(join(directory, 'workspaces'))).toBe(true)
  expect(await git(['worktree', 'list', '--porcelain'])).toContain(result.worktree.path)
  expect(await readFile(join(result.worktree.path, '.git'), 'utf8')).toContain('gitdir:')
  await store.flushPendingOrThrowAsync()
  expect(
    JSON.stringify(readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'worktreeMeta'))
  ).toContain(result.worktree.instanceId)
  const removed = await invoke('rm', [['worktree', `id:${result.worktree.id}`]])
  expect(removed.removed).toBe(true)
  await finishAcceptedWorktreeRemoval(removed, result.worktree.id, 'local')
  await expect(access(result.worktree.path)).rejects.toThrow()
  expect(await git(['worktree', 'list', '--porcelain'])).not.toContain(result.worktree.path)
  expect(store.getWorktreeMetaForHost(result.worktree.id, 'local')).toBeUndefined()
  await access(repoPath)
})
it('keeps a dirty Git checkout and refuses an unavailable fixture PTY inventory', async () => {
  const { worktree } = await create('protected')
  await writeFile(join(worktree.path, 'keep.txt'), 'private fixture content')
  await expect(invoke('rm', [['worktree', `id:${worktree.id}`]])).rejects.toThrow()
  expect(await readFile(join(worktree.path, 'keep.txt'), 'utf8')).toBe('private fixture content')
  await rm(join(worktree.path, 'keep.txt'))
  inventoryUnavailable = true
  await expect(invoke('rm', [['worktree', `id:${worktree.id}`]])).rejects.toThrow()
  await access(worktree.path)
  expect(await git(['worktree', 'list', '--porcelain'])).toContain(worktree.path)
})
it('creates and removes a folder instance while preserving its shared directory and files', async () => {
  const path = join(directory, 'folder')
  await mkdir(path)
  await writeFile(join(path, 'keep.txt'), 'keep')
  store.addRepo({
    id: 'folder',
    path,
    kind: 'folder',
    displayName: 'Folder',
    badgeColor: 'blue',
    addedAt: 1
  })
  const { worktree } = await create('Folder child', 'folder')
  expect(worktree.path).toBe(path)
  expect(worktree.isMainWorktree).toBe(false)
  expect(store.getWorktreeMetaForHost(worktree.id, 'local')?.instanceId).toBe(worktree.instanceId)
  expect(await invoke('rm', [['worktree', `id:${worktree.id}`]])).toMatchObject({ removed: true })
  expect(store.getWorktreeMetaForHost(worktree.id, 'local')).toBeUndefined()
  expect(await readFile(join(path, 'keep.txt'), 'utf8')).toBe('keep')
})
it('rejects disconnected SSH creation and a failed-hook waiver without --run-hooks', async () => {
  store.addRepo({
    id: 'remote',
    path: repoPath,
    connectionId: 'fixture-disconnected',
    displayName: 'Remote',
    badgeColor: 'blue',
    addedAt: 1
  })
  await expect(create('remote-child', 'remote')).rejects.toThrow()
  expect(await git(['worktree', 'list', '--porcelain'])).not.toContain('remote-child')
  const { worktree } = await create('hook-gate')
  vi.mocked(ctx.client.call).mockClear()
  await expect(
    invoke('rm', [
      ['worktree', `id:${worktree.id}`],
      ['allow-failed-archive-hook', true]
    ])
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(vi.mocked(ctx.client.call).mock.calls.map(([method]) => method)).toEqual(['worktree.show'])
  await access(worktree.path)
})
