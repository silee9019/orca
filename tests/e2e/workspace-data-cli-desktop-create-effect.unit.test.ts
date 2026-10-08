import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow, ipcMain } from 'electron'
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, access } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
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
import * as createTelemetry from '../../src/main/workspace-create-telemetry'
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { runProcess } from '../../src/shared/child-process/run-process'
import { DesktopWorktreeCreate } from '../../src/shared/rpc-contract/workspace-desktop-create-params'
import { WORKSPACE_DESKTOP_CREATE_HANDLERS } from '../../src/cli/handlers/workspace-desktop-create'
import {
  WORKSPACE_DESKTOP_CREATE_METHODS,
  setDesktopWorktreeCreateForRpc
} from '../../src/main/runtime/rpc/methods/workspace-desktop-create'
import { registerWorktreeCreateHandlers } from '../../src/main/ipc/worktrees/create/register-worktree-create-handlers'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
let directory: string
let repoPath: string
let store: Store
let authority: ProfileStateSqliteAuthority
let runtime: OrcaRuntimeService
let window: BrowserWindow
let ctx: HandlerContext
const lifecycle = vi.fn()
const request = {
  repoId: 'fixture',
  name: 'child',
  expectedExecutionHostId: 'local',
  expectedRepoHostId: 'local',
  setupDecision: 'skip',
  baseBranch: 'HEAD'
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
async function invoke(params: unknown, confirm = 'fixture:local:child') {
  await writeFile(join(directory, 'input.json'), JSON.stringify(params))
  ctx.flags = new Map([
    ['params-file', 'input.json'],
    ['confirm', confirm]
  ])
  await WORKSPACE_DESKTOP_CREATE_HANDLERS['worktree create-desktop'](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-desktop-create-')))
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
  await mkdir(join(repoPath, 'included'))
  await mkdir(join(repoPath, 'excluded'))
  await writeFile(join(repoPath, 'included', 'file.txt'), 'included')
  await writeFile(join(repoPath, 'excluded', 'file.txt'), 'excluded')
  await git(['add', '.'])
  await git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
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
  store.saveSparsePreset({
    id: 'fixture',
    repoId: 'fixture',
    name: 'Included',
    directories: ['included'],
    createdAt: 1,
    updatedAt: 1
  })
  vi.spyOn(createTelemetry, 'beginWorkspaceCreateTelemetry')
  runtime = new OrcaRuntimeService(store)
  vi.spyOn(runtime, 'notifyWorktreesChangedForRemoteClients').mockImplementation(() => {})
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
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_DESKTOP_CREATE_METHODS })
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
  setDesktopWorktreeCreateForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
it('creates an actual sparse Git checkout and persists labels, branch, agent and rename reservation before acknowledgement', async () => {
  const result = await invoke({
    ...request,
    branchNameOverride: 'feature/desktop',
    displayName: 'Desktop label',
    displayNameKind: 'user',
    createdWithAgent: 'codex',
    pendingFirstAgentMessageRename: true,
    sparseCheckout: { directories: ['included'], presetId: 'fixture' },
    linkedIssue: 42,
    manualOrder: 7
  })
  expect(result).toMatchObject({
    created: true,
    executionHostId: 'local',
    repoHostId: 'local',
    worktree: { branch: 'refs/heads/feature/desktop' }
  })
  expect(createTelemetry.beginWorkspaceCreateTelemetry).toHaveBeenCalledWith(
    expect.objectContaining({ entryPoint: 'runtime' })
  )
  expect(result.creationId).toMatch(/^[a-f0-9-]{36}$/)
  expect(await readFile(join(result.worktree.path, 'included', 'file.txt'), 'utf8')).toBe(
    'included'
  )
  await expect(access(join(result.worktree.path, 'excluded', 'file.txt'))).rejects.toThrow()
  expect(await git(['branch', '--show-current'], result.worktree.path)).toBe('feature/desktop\n')
  expect(store.getWorktreeMeta(result.worktree.id)).toMatchObject({
    displayName: 'Desktop label',
    displayNameIsPinned: true,
    createdWithAgent: 'codex',
    pendingFirstAgentMessageRename: true,
    sparseDirectories: ['included'],
    sparsePresetId: 'fixture',
    linkedIssue: 42,
    manualOrder: 7,
    cliProvenance: { kind: 'created-by-cli' }
  })
  expect(
    JSON.stringify(readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'worktreeMeta'))
  ).toContain(result.worktree.instanceId)
  expect(window.webContents.send).toHaveBeenCalledWith('worktrees:changed', { repoId: 'fixture' })
  expect(lifecycle).toHaveBeenCalledWith({
    kind: 'created',
    worktreeId: result.worktree.id,
    path: result.worktree.path,
    branch: 'refs/heads/feature/desktop'
  })
})
it('hands startup to the original runtime boundary and returns only actual sanitized acknowledgement', async () => {
  const terminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue({
    handle: 'fixture-terminal',
    worktreeId: 'fixture',
    title: null,
    surface: 'background'
  })
  const startup = {
    command: 'private-startup-canary',
    env: { PRIVATE_CANARY: 'private-env-canary' },
    viewMode: 'terminal',
    startupCommandDelivery: 'shell-ready'
  }
  const result = await invoke({ ...request, startup, createdWithAgent: 'codex' })
  expect(terminal).toHaveBeenCalledWith(
    `id:${result.worktree.id}`,
    expect.objectContaining({ ...startup, launchAgent: 'codex', surfaceOwner: false }),
    expect.objectContaining({ id: result.worktree.id })
  )
  expect(result.startupTerminal).toEqual({ spawned: true, surface: 'background' })
  expect(JSON.stringify(result)).not.toContain('private-')
  expect(JSON.stringify(result)).not.toContain('fixture-terminal')
})
it('does not turn a startup spawn failure into a success acknowledgement or leak the private warning', async () => {
  vi.spyOn(runtime, 'createTerminal').mockRejectedValue(new Error('private-startup-canary'))
  const result = await invoke({ ...request, startup: { command: 'fixture' } })
  expect(result.created).toBe(true)
  expect(result.warning).toBe(true)
  expect(result.startupTerminal?.spawned).not.toBe(true)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-startup-canary')
})
it('registers a real folder instance while preserving files and refusing unsupported folder startup', async () => {
  const path = join(directory, 'folder')
  await mkdir(path)
  await writeFile(join(path, 'keep'), 'keep')
  store.addRepo({
    id: 'folder',
    kind: 'folder',
    path,
    displayName: 'Folder',
    badgeColor: 'blue',
    addedAt: 1
  })
  const params = { ...request, repoId: 'folder' }
  const result = await invoke(params, 'folder:local:child')
  expect(result.worktree.path).toBe(path)
  for (const unsupported of [
    { pendingFirstAgentMessageRename: true, createdWithAgent: 'codex' },
    { sparseCheckout: { directories: ['included'] } },
    { pushTarget: { remoteName: 'origin', branchName: 'child' } }
  ]) {
    await expect(invoke({ ...params, ...unsupported }, 'folder:local:child')).rejects.toThrow(
      'Desktop workspace creation failed.'
    )
  }
  expect(store.getWorktreeMeta(result.worktree.id)?.cliProvenance?.kind).toBe('created-by-cli')
  expect(await readFile(join(path, 'keep'), 'utf8')).toBe('keep')
  await expect(
    invoke({ ...params, startup: { command: 'fixture' } }, 'folder:local:child')
  ).rejects.toThrow('Desktop workspace creation failed.')
})
it('preserves the original IPC return, default app provenance and lifecycle notification', async () => {
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'worktrees:create')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC')
  }
  const result = await Reflect.apply(callback, undefined, [
    {},
    { repoId: 'fixture', name: 'original', baseBranch: 'HEAD', setupDecision: 'skip' }
  ])
  expect(result.worktree.branch).toBe('refs/heads/original')
  expect(createTelemetry.beginWorkspaceCreateTelemetry).toHaveBeenCalledWith(
    expect.objectContaining({ entryPoint: 'app' })
  )
  expect(result.catalogVersion).toBeDefined()
  expect(store.getWorktreeMeta(result.worktree.id)?.cliProvenance).toBeUndefined()
  expect(lifecycle).toHaveBeenCalled()
})
it('refuses wrong or ambiguous owners and disconnected SSH without a local checkout fallback', async () => {
  await expect(
    invoke({ ...request, expectedRepoHostId: 'ssh:absent' }, 'fixture:ssh:absent:child')
  ).rejects.toThrow()
  store.addRepo({ ...store.getRepos()[0], connectionId: 'absent', executionHostId: 'ssh:absent' })
  expect(store.getRepos().filter((repo) => repo.id === 'fixture')).toHaveLength(2)
  await expect(invoke(request)).rejects.toThrow()
  await expect(
    invoke({ ...request, expectedRepoHostId: 'ssh:absent' }, 'fixture:ssh:absent:child')
  ).rejects.toThrow()
  expect(await git(['worktree', 'list', '--porcelain'])).not.toContain('/child')
  store.addRepo({
    id: 'remote',
    path: join(directory, 'never-create'),
    executionHostId: 'ssh:absent',
    displayName: 'Remote',
    badgeColor: 'blue',
    addedAt: 1
  })
  await expect(
    invoke(
      { ...request, repoId: 'remote', expectedRepoHostId: 'ssh:absent' },
      'remote:ssh:absent:child'
    )
  ).rejects.toThrow()
  await expect(access(join(directory, 'never-create'))).rejects.toThrow()
})
it('rejects invalid authority, confirmation and old/service peers and redacts save failure after creation', async () => {
  await expect(invoke(request, 'wrong')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(invoke({ ...request, creationId: 'foreign' })).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValueOnce(
    new Error('private-save-canary')
  )
  await expect(invoke(request)).rejects.toThrow('Desktop workspace creation failed.')
  expect(await git(['worktree', 'list', '--porcelain'])).toContain('/child')
  expect(console.log).not.toHaveBeenCalled()
  setDesktopWorktreeCreateForRpc(null)
  await expect(invoke(request)).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke(request)).rejects.toMatchObject({ code: 'method_not_found' })
})
it('rejects client-owned creation and launch authority fields', () => {
  const valid = {
    repoId: 'fixture',
    name: 'child',
    expectedExecutionHostId: 'local',
    expectedRepoHostId: 'local',
    setupDecision: 'skip'
  }
  expect(DesktopWorktreeCreate.safeParse(valid).success).toBe(true)
  for (const extra of [
    { creationId: 'foreign' },
    { cliProvenance: {} },
    { startup: { command: 'fixture', launchToken: 'foreign' } }
  ]) {
    expect(DesktopWorktreeCreate.safeParse({ ...valid, ...extra }).success).toBe(false)
  }
})
