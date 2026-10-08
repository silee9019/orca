import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow } from 'electron'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, vi } from 'vitest'
import type * as GitRunner from '../../src/main/git/runner'
import type * as SshTargetRegistry from '../../src/main/ssh/ssh-target-registry'
import type { SshGitProvider } from '../../src/main/providers/ssh-git-provider'
import type { IFilesystemProvider } from '../../src/main/providers/types'
import type { HandlerContext } from '../../src/cli/dispatch'
vi.mock('../../src/main/git/runner', async (importOriginal) => {
  const original = await importOriginal<typeof GitRunner>()
  return {
    ...original,
    gitSpawnAfterWindowsEnvironmentReady: (
      ...args: Parameters<typeof GitRunner.gitSpawnAfterWindowsEnvironmentReady>
    ) =>
      spawnOverride
        ? spawnOverride(...args)
        : original.gitSpawnAfterWindowsEnvironmentReady(...args)
  }
})
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  webContents: { fromId: vi.fn() },
  BrowserWindow: class {
    webContents = { send: vi.fn(), isDestroyed: () => false }
    isDestroyed() {
      return false
    }
  }
}))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/ipc/ssh', () => ({ getActiveMultiplexer: () => undefined }))
vi.mock('../../src/main/ssh/ssh-target-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof SshTargetRegistry>()),
  getActiveMultiplexer: () => undefined
}))
vi.mock('../../src/main/repo-icon-autodetect', () => ({
  detectRepoIconAndUpstream: async () => ({})
}))
vi.mock('../../src/main/providers/ssh-git-dispatch', () => ({
  getSshGitProvider: (id: string) => (id === 'clone-fixture' && connected ? gitProvider : undefined)
}))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: (id: string) =>
    id === 'clone-fixture' && connected ? fsProvider : undefined,
  requireSshFilesystemProvider: (id: string) => {
    if (id !== 'clone-fixture' || !connected) {
      throw new Error('SSH filesystem provider unavailable')
    }
    return fsProvider
  }
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { runProcess } from '../../src/shared/child-process/run-process'
import { getRemoteHostPlatform } from '../../src/main/ssh/ssh-remote-platform'
import { WORKSPACE_REMOTE_CLONE_HANDLERS } from '../../src/cli/handlers/workspace-remote-clone'
import {
  WORKSPACE_REMOTE_CLONE_METHODS,
  setDesktopRemoteCloneForRpc
} from '../../src/main/runtime/rpc/methods/workspace-remote-clone'
import { registerRepoCloneHandlers } from '../../src/main/ipc/repos/repo-clone-lifecycle'
import { abortActiveRemoteClone } from '../../src/main/ipc/repos/remote-repo-clone'
import { setSshConnectionGeneration } from '../../src/main/ssh/ssh-connection-generation'
export let directory: string,
  source: string,
  destination: string,
  url: string,
  store: Store,
  authority: ProfileStateSqliteAuthority,
  window: BrowserWindow,
  ctx: HandlerContext
export let connected = true
let generation = 2000
let spawnOverride: typeof GitRunner.gitSpawnAfterWindowsEnvironmentReady | null = null
let cloneOperation: SshGitProvider['clone']
let probe: SshGitProvider['isGitRepoAsync']
export const gitProvider: Pick<SshGitProvider, 'clone' | 'getHostPlatform' | 'isGitRepoAsync'> = {
  clone: vi.fn((args, cwd, options) => cloneOperation(args, cwd, options)),
  getHostPlatform: () =>
    getRemoteHostPlatform(process.platform === 'win32' ? 'win32-x64' : 'linux-x64'),
  isGitRepoAsync: (path) => probe(path)
}
export const fsProvider: Pick<IFilesystemProvider, 'createDir' | 'downloadFolder'> = {
  createDir: async (path) => {
    await mkdir(path, { recursive: true })
  }
}
export async function git(args: string[], cwd: string, signal?: AbortSignal) {
  const result = await runProcess({
    program: 'git',
    args: [
      '-c',
      `core.hooksPath=${devNull}`,
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      ...args
    ],
    cwd,
    signal,
    timeoutMs: 10000,
    maxOutputBytes: 100000
  })
  if (result.code !== 0) {
    throw new Error('Private fixture Git command failed')
  }
  return result
}
export async function invoke(
  action: string,
  params: object,
  confirm = `ssh:clone-fixture:${destination}`
) {
  const input = join(directory, 'params.json')
  await writeFile(input, JSON.stringify({ expectedExecutionHostId: 'local', ...params }))
  ctx.flags = new Map([
    ['params-file', input],
    ['confirm', confirm]
  ])
  await WORKSPACE_REMOTE_CLONE_HANDLERS[`repo clone-desktop-remote-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
export async function start() {
  return invoke('start', { expectedCloneHostId: 'ssh:clone-fixture', url, destination })
}
export async function wait(requestId: string, state: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const status = await invoke('status', { requestId })
    if (status.state === state) {
      return
    }
    if (['completed', 'failed', 'cancelled'].includes(status.state)) {
      throw new Error(`Unexpected clone state: ${status.state}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Clone did not settle')
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-remote-clone-')))
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
  source = join(directory, 'source')
  destination = join(directory, 'destination')
  await mkdir(source)
  await git(['init'], source)
  await git(['commit', '--allow-empty', '-m', 'Fixture'], source)
  url = pathToFileURL(source).href
  spawnOverride = null
  connected = true
  fsProvider.downloadFolder = undefined
  vi.mocked(gitProvider.clone).mockClear()
  cloneOperation = async (args, cwd, options) => {
    options?.onProgress?.({ phase: 'private progress phase', percent: 42 })
    return git(args, cwd, options?.signal)
  }
  probe = async (path) => ({
    isRepo: true,
    rootPath: (await git(['rev-parse', '--show-toplevel'], path)).stdout.trim()
  })
  window = new BrowserWindow()
  registerRepoCloneHandlers(window, store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_REMOTE_CLONE_METHODS
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
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  setDesktopRemoteCloneForRpc(null)
  abortActiveRemoteClone()
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
export function getCloneOperation() {
  return cloneOperation
}
export function setCloneOperation(operation: SshGitProvider['clone']) {
  cloneOperation = operation
}
export function getProbe() {
  return probe
}
export function setProbe(operation: SshGitProvider['isGitRepoAsync']) {
  probe = operation
}
export function changeGeneration() {
  setSshConnectionGeneration('clone-fixture', ++generation)
}
export function setDestination(path: string) {
  destination = path
}
export function disconnect() {
  connected = false
}
export function setCloneSpawn(
  operation: typeof GitRunner.gitSpawnAfterWindowsEnvironmentReady | null
) {
  spawnOverride = operation
}
