import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow, ipcMain } from 'electron'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type { SshGitProvider } from '../../src/main/providers/ssh-git-provider'
import type * as SshGitDispatch from '../../src/main/providers/ssh-git-dispatch'
vi.mock('electron', () => ({
  app: { getPath: () => directory },
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
vi.mock('../../src/main/providers/ssh-git-dispatch', async (importOriginal) => ({
  ...(await importOriginal<typeof SshGitDispatch>()),
  getSshGitProvider: (id: string) => (connected && id === connectionId ? provider : undefined)
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { runProcess } from '../../src/shared/child-process/run-process'
import { listWorktreesStrict } from '../../src/main/git/worktree-listing'
import {
  upsertEphemeralVmRuntime,
  listEphemeralVmRuntimes
} from '../../src/shared/ephemeral-vm-runtime-store'
import {
  rotateSshProviderAuthority,
  resetSshProviderAuthorities
} from '../../src/main/ssh/ssh-provider-authority'
import { DesktopProvisionedRootAdopt } from '../../src/shared/rpc-contract/workspace-desktop-adopt-params'
import { WORKSPACE_DESKTOP_ADOPT_HANDLERS } from '../../src/cli/handlers/workspace-desktop-adopt'
import {
  WORKSPACE_DESKTOP_ADOPT_METHODS,
  setDesktopProvisionedRootAdoptionForRpc
} from '../../src/main/runtime/rpc/methods/workspace-desktop-adopt'
import { setDesktopWorktreeCreateForRpc } from '../../src/main/runtime/rpc/methods/workspace-desktop-create'
import { registerWorktreeCreateHandlers } from '../../src/main/ipc/worktrees/create/register-worktree-create-handlers'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
let directory: string, repoPath: string, head: string
let store: Store,
  authority: ProfileStateSqliteAuthority,
  runtime: OrcaRuntimeService,
  window: BrowserWindow,
  ctx: HandlerContext
let connected = true
let duringRead: 'none' | 'authority' | 'repo' | 'runtime' = 'none'
const connectionId = 'runtime-ssh-fixture'
const lifecycle = vi.fn()
const provider: Pick<SshGitProvider, 'exec' | 'listWorktrees'> = {
  listWorktrees: async (path) => {
    expect(path).toBe(repoPath)
    const result = await listWorktreesStrict(path)
    if (duringRead === 'authority') {
      rotateSshProviderAuthority(connectionId)
    }
    if (duringRead === 'repo') {
      store.updateRepo('fixture', { executionHostId: 'ssh:runtime-ssh-changed' })
    }
    if (duringRead === 'runtime') {
      const record = listEphemeralVmRuntimes(directory)[0]
      upsertEphemeralVmRuntime(directory, { ...record, status: 'cleanup_pending' })
    }
    return result
  },
  exec: async (args, cwd) => {
    expect(cwd).toBe(repoPath)
    expect(args).toEqual(['config', '--bool', '--get', '--default=false', 'core.sparseCheckout'])
    const result = await runProcess({
      program: 'git',
      args,
      cwd,
      timeoutMs: 10000,
      maxOutputBytes: 100000
    })
    expect(result.code, result.stderr).toBe(0)
    return { stdout: result.stdout, stderr: result.stderr }
  }
}
function params() {
  return {
    repoId: 'fixture',
    name: 'child',
    expectedExecutionHostId: 'local',
    expectedRepoHostId: `ssh:${connectionId}`,
    setupDecision: 'skip',
    runtimeId: 'fixture-runtime',
    expectedPath: repoPath,
    baseBranch: 'HEAD',
    expectedRefHead: head
  }
}
async function git(args: string[], cwd = repoPath) {
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
    timeoutMs: 10000,
    maxOutputBytes: 100000
  })
  expect(result.code, result.stderr).toBe(0)
  return result.stdout
}
async function invoke(
  input: unknown = params(),
  confirm = `fixture:ssh:${connectionId}:fixture-runtime:${repoPath}`
) {
  await writeFile(join(directory, 'input.json'), JSON.stringify(input))
  ctx.flags = new Map([
    ['params-file', 'input.json'],
    ['confirm', confirm]
  ])
  await WORKSPACE_DESKTOP_ADOPT_HANDLERS['worktree adopt-desktop-provisioned-root'](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-desktop-adopt-')))
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
  repoPath = join(directory, 'repo')
  await mkdir(repoPath)
  await git(['init'])
  await git(['checkout', '-b', 'child'])
  await git(['config', '--local', 'core.hooksPath', devNull])
  await git(['config', '--local', 'commit.gpgsign', 'false'])
  await git(['commit', '--allow-empty', '-m', 'Fixture'])
  head = (await git(['rev-parse', 'HEAD'])).trim()
  store.addRepo({
    id: 'fixture',
    path: repoPath,
    connectionId,
    displayName: 'Fixture',
    badgeColor: 'blue',
    addedAt: 1
  })
  upsertEphemeralVmRuntime(directory, {
    id: 'fixture-runtime',
    recipeId: 'fixture',
    recipe: {
      id: 'fixture',
      name: 'Fixture',
      create: 'never-execute-fixture',
      checkoutMode: 'provisioned-root'
    },
    connectionMode: 'ssh',
    sshTargetId: connectionId,
    status: 'running',
    cleanupStatus: 'not_started',
    createdAt: 1,
    updatedAt: 1,
    recipeResult: {
      schemaVersion: 2,
      checkoutMode: 'provisioned-root',
      connection: {
        type: 'ssh',
        target: { label: 'Fixture', host: '127.0.0.1', port: 22, username: 'fixture' },
        projectRoot: repoPath
      }
    }
  })
  connected = true
  duringRead = 'none'
  resetSshProviderAuthorities()
  runtime = new OrcaRuntimeService(store)
  window = new BrowserWindow()
  vi.mocked(ipcMain.handle).mockClear()
  lifecycle.mockClear()
  registerWorktreeCreateHandlers({
    store,
    runtime,
    mainWindow: window,
    options: { onWorktreeLifecycle: lifecycle },
    detectedWorktreeCancellations: createSenderScopedRequestCancellations(),
    worktreeRemovalsInFlight: new Map()
  })
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_DESKTOP_ADOPT_METHODS })
  const client = new RuntimeClient('different-client-profile')
  vi.spyOn(client, 'call').mockImplementation(async (method, input) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params: input
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
  setDesktopProvisionedRootAdoptionForRpc(null)
  setDesktopWorktreeCreateForRpc(null)
  resetSshProviderAuthorities()
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
it('attaches the owned runtime to the actual primary Git checkout and persists host metadata before acknowledgement', async () => {
  const result = await invoke({
    ...params(),
    displayName: 'Adopted label',
    displayNameKind: 'user',
    createdWithAgent: 'codex',
    pendingFirstAgentMessageRename: true,
    linkedIssue: 42
  })
  expect(result).toMatchObject({
    adopted: true,
    runtimeId: 'fixture-runtime',
    repoHostId: `ssh:${connectionId}`,
    worktree: { path: repoPath, branch: 'refs/heads/child' }
  })
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBe(result.worktree.id)
  expect(store.getWorktreeMetaForHost(result.worktree.id, `ssh:${connectionId}`)).toMatchObject({
    hostId: `ssh:${connectionId}`,
    ephemeralVmCheckoutMode: 'provisioned-root',
    displayName: 'Adopted label',
    displayNameIsPinned: true,
    createdWithAgent: 'codex',
    pendingFirstAgentMessageRename: true,
    linkedIssue: 42,
    cliProvenance: { kind: 'created-by-cli' }
  })
  expect(
    JSON.stringify(readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'worktreeMeta'))
  ).toContain(result.worktree.instanceId)
  expect(window.webContents.send).toHaveBeenCalledWith('worktrees:changed', { repoId: 'fixture' })
  expect(lifecycle).toHaveBeenCalledWith({
    kind: 'created',
    worktreeId: result.worktree.id,
    path: repoPath,
    branch: 'refs/heads/child'
  })
  expect(JSON.stringify(result)).not.toContain('127.0.0.1')
})
it('preserves original IPC adoption without stamping CLI provenance', async () => {
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'worktrees:adoptProvisionedRoot')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC')
  }
  const { expectedExecutionHostId, expectedRepoHostId, ...args } = params()
  expect(expectedExecutionHostId).toBe('local')
  const result = await Reflect.apply(callback, undefined, [
    {},
    { ...args, executionHostId: expectedRepoHostId }
  ])
  expect(result.worktree.isMainWorktree).toBe(true)
  expect(result.catalogVersion).toBeDefined()
  expect(
    store.getWorktreeMetaForHost(result.worktree.id, `ssh:${connectionId}`)?.cliProvenance
  ).toBeUndefined()
})
it('refuses wrong path, branch, ref and missing base identity before attachment', async () => {
  for (const extra of [
    { expectedPath: join(directory, 'wrong') },
    { branchNameOverride: 'wrong' },
    { expectedRefHead: 'stale' },
    { expectedRefHead: undefined },
    { runtimeId: 'missing' }
  ]) {
    const input = { ...params(), ...extra }
    await expect(
      invoke(input, `fixture:ssh:${connectionId}:${input.runtimeId}:${input.expectedPath}`)
    ).rejects.toThrow('Desktop provisioned-root adoption failed.')
    expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeUndefined()
  }
})
it('rejects sparse and cleanup-state runtimes without creating metadata', async () => {
  await git(['config', '--local', 'core.sparseCheckout', 'true'])
  await expect(invoke()).rejects.toThrow()
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeUndefined()
  await git(['config', '--local', 'core.sparseCheckout', 'false'])
  const record = listEphemeralVmRuntimes(directory)[0]
  upsertEphemeralVmRuntime(directory, { ...record, status: 'cleanup_pending' })
  await expect(invoke()).rejects.toThrow()
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeUndefined()
})
it('rejects provider authority and captured repository changes during reads', async () => {
  duringRead = 'authority'
  await expect(invoke()).rejects.toThrow()
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeUndefined()
  duringRead = 'repo'
  await expect(invoke()).rejects.toThrow()
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeUndefined()
})
it('rechecks runtime ownership after Git reads before attachment', async () => {
  duringRead = 'runtime'
  await expect(invoke()).rejects.toThrow('Desktop provisioned-root adoption failed.')
  expect(listEphemeralVmRuntimes(directory)[0]).toMatchObject({ status: 'cleanup_pending' })
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeUndefined()
})
it('rejects disconnected providers and ambiguous owners without local fallback', async () => {
  connected = false
  await expect(invoke()).rejects.toThrow()
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeUndefined()
  connected = true
  store.addRepo({ ...store.getRepos()[0], connectionId: undefined, executionHostId: 'local' })
  expect(store.getRepos().filter((repo) => repo.id === 'fixture')).toHaveLength(2)
  await expect(invoke()).rejects.toThrow()
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeUndefined()
  expect(await git(['branch', '--show-current'])).toBe('child\n')
})
it('redacts save errors after attachment and rejects confirmation, forged provenance, service and old peers', async () => {
  await expect(invoke(params(), 'wrong')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(invoke({ ...params(), cliProvenance: {} })).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValueOnce(
    new Error('private-save-canary')
  )
  await expect(invoke()).rejects.toThrow('Desktop provisioned-root adoption failed.')
  expect(listEphemeralVmRuntimes(directory)[0].workspaceId).toBeDefined()
  expect(console.log).not.toHaveBeenCalled()
  setDesktopProvisionedRootAdoptionForRpc(null)
  await expect(invoke()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke()).rejects.toMatchObject({ code: 'method_not_found' })
})
it('rejects startup, sparse checkout and caller system provenance for adoption', () => {
  const valid = {
    repoId: 'fixture',
    name: 'child',
    expectedExecutionHostId: 'local',
    expectedRepoHostId: 'ssh:runtime-ssh-fixture',
    setupDecision: 'skip',
    runtimeId: 'fixture-runtime',
    expectedPath: '/fixture'
  }
  expect(DesktopProvisionedRootAdopt.safeParse(valid).success).toBe(true)
  for (const extra of [
    { startup: { command: 'fixture' } },
    { sparseCheckout: { directories: ['src'] } },
    { cliProvenance: {} },
    { setupDecision: 'run' }
  ]) {
    expect(DesktopProvisionedRootAdopt.safeParse({ ...valid, ...extra }).success).toBe(false)
  }
})
