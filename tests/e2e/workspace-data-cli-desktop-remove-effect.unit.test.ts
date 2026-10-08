import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow, ipcMain } from 'electron'
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, access } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type * as PtyRegistry from '../../src/main/ipc/pty/provider/registry'
import type { IPtyProvider } from '../../src/main/providers/pty-provider-contract'
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
vi.mock('../../src/main/ipc/pty/provider/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof PtyRegistry>()),
  getLocalPtyProvider: () => provider
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { runProcess } from '../../src/shared/child-process/run-process'
import { DesktopWorktreeRemove } from '../../src/shared/rpc-contract/workspace-desktop-remove-params'
import { WORKSPACE_DESKTOP_REMOVE_HANDLERS } from '../../src/cli/handlers/workspace-desktop-remove'
import {
  WORKSPACE_DESKTOP_REMOVE_METHODS,
  setDesktopWorktreeRemovalForRpc
} from '../../src/main/runtime/rpc/methods/workspace-desktop-remove'
import { registerWorktreeRemovalHandlers } from '../../src/main/ipc/worktrees/removal/register-worktree-removal-handlers'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
import { createFolderWorkspace } from '../../src/main/ipc/worktrees/create/folder-workspace-creation'
let directory: string, repoPath: string, childPath: string
let store: Store,
  authority: ProfileStateSqliteAuthority,
  runtime: OrcaRuntimeService,
  window: BrowserWindow,
  ctx: HandlerContext
let target: { worktreeId: string; executionHostId: 'local'; identityKey: string }
let inventoryUnavailable = false
const lifecycle = vi.fn()
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
async function invoke(command: string, params: unknown, confirm = target.identityKey) {
  await writeFile(join(directory, 'input.json'), JSON.stringify(params))
  ctx.flags = new Map([
    ['params-file', 'input.json'],
    ['confirm', confirm]
  ])
  await WORKSPACE_DESKTOP_REMOVE_HANDLERS[`worktree ${command}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
async function preview() {
  return (await invoke('preview-desktop-removal', { target })).checkouts
}
async function remove(extra: Record<string, unknown> = {}) {
  const checkouts = await preview()
  return invoke('remove-desktop', { target, expectedCheckout: checkouts.at(-1), ...extra })
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-desktop-remove-')))
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
  childPath = join(directory, 'child')
  await mkdir(repoPath)
  await git(['init'])
  await git(['config', '--local', 'core.hooksPath', devNull])
  await git(['config', '--local', 'commit.gpgsign', 'false'])
  await git(['commit', '--allow-empty', '-m', 'Fixture'])
  await git(['worktree', 'add', '-b', 'child', childPath])
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
  vi.spyOn(runtime, 'publishWorktreeRemovalChange')
  const child = await runtime.showManagedWorktree(`path:${childPath}`)
  if (!child.identity) {
    throw new Error('Missing fixture identity')
  }
  target = { worktreeId: child.id, executionHostId: 'local', identityKey: child.identity.key }
  window = new BrowserWindow()
  vi.mocked(ipcMain.handle).mockClear()
  lifecycle.mockClear()
  registerWorktreeRemovalHandlers({
    store,
    runtime,
    mainWindow: window,
    options: { onWorktreeLifecycle: lifecycle },
    detectedWorktreeCancellations: createSenderScopedRequestCancellations(),
    worktreeRemovalsInFlight: new Map()
  })
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_DESKTOP_REMOVE_METHODS })
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
  setDesktopWorktreeRemovalForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
it('waits for actual Git checkout, registration and SQLite removal before acknowledgement', async () => {
  const result = await remove()
  expect(result).toMatchObject({
    removed: true,
    worktreeId: target.worktreeId,
    scope: 'checkout-and-metadata',
    executionVerdict: 'unverifiable',
    archiveHookFailureWaived: false
  })
  await expect(access(childPath)).rejects.toThrow()
  expect(await git(['worktree', 'list', '--porcelain'])).not.toContain(childPath)
  expect(store.getWorktreeMeta(target.worktreeId)).toBeUndefined()
  expect(
    JSON.stringify(readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'worktreeMeta'))
  ).not.toContain(target.worktreeId)
  expect(runtime.publishWorktreeRemovalChange).toHaveBeenCalledWith('fixture')
  expect(lifecycle).toHaveBeenCalledTimes(1)
  await access(repoPath)
})
it('requires a fresh HEAD and preserves dirty, locked, main and missing-preview checkouts', async () => {
  await expect(invoke('remove-desktop', { target })).rejects.toThrow()
  const checkouts = await preview()
  await git(['commit', '--allow-empty', '-m', 'Changed'], childPath)
  await expect(
    invoke('remove-desktop', { target, expectedCheckout: checkouts.at(-1) })
  ).rejects.toThrow()
  await writeFile(join(childPath, 'keep'), 'keep')
  await expect(remove()).rejects.toThrow()
  expect(await readFile(join(childPath, 'keep'), 'utf8')).toBe('keep')
  await rm(join(childPath, 'keep'))
  await git(['worktree', 'lock', childPath])
  await expect(remove({ force: true })).rejects.toThrow()
  await git(['worktree', 'unlock', childPath])
  const root = await runtime.showManagedWorktree(`path:${repoPath}`)
  if (!root.identity) {
    throw new Error('Missing root identity')
  }
  await expect(
    invoke('preview-desktop-removal', {
      target: { worktreeId: root.id, executionHostId: 'local', identityKey: root.identity.key }
    })
  ).rejects.toThrow()
  await access(childPath)
})
it('refuses missing, stale or incomplete nested approval and deletes only the exact approved plan', async () => {
  const nested = join(childPath, 'nested')
  await git(['worktree', 'add', '-b', 'nested', nested])
  const checkouts = await preview()
  expect(checkouts).toHaveLength(2)
  await expect(remove({ force: true })).rejects.toThrow()
  await expect(
    remove({ force: true, approvedNestedWorktrees: checkouts.slice(-1) })
  ).rejects.toThrow()
  await git(['commit', '--allow-empty', '-m', 'Changed nested'], nested)
  await expect(remove({ force: true, approvedNestedWorktrees: checkouts })).rejects.toThrow()
  await access(nested)
  const fresh = await preview()
  expect(await remove({ force: true, approvedNestedWorktrees: fresh })).toMatchObject({
    removed: true
  })
  await expect(access(nested)).rejects.toThrow()
  await expect(access(childPath)).rejects.toThrow()
  expect(await git(['worktree', 'list', '--porcelain'])).not.toContain(childPath)
})
it('keeps force separate from an unavailable PTY inventory waiver', async () => {
  inventoryUnavailable = true
  await expect(remove({ force: true })).rejects.toThrow()
  await access(childPath)
  expect(await remove({ force: true, allowUnverifiedPtyStop: true })).toMatchObject({
    removed: true,
    executionVerdict: 'unverifiable'
  })
})
it('removes folder metadata with an unverifiable process verdict while preserving files and root', async () => {
  const path = join(directory, 'folder')
  await mkdir(path)
  await writeFile(join(path, 'keep'), 'keep')
  const repo = {
    id: 'folder',
    kind: 'folder' as const,
    path,
    displayName: 'Folder',
    badgeColor: 'blue',
    addedAt: 1
  }
  store.addRepo(repo)
  const result = createFolderWorkspace({ repoId: 'folder', name: 'child' }, repo, store)
  const folderTarget = {
    worktreeId: result.worktree.id,
    executionHostId: 'local',
    instanceId: result.worktree.instanceId
  }
  const confirm = `${folderTarget.worktreeId}:${folderTarget.instanceId}`
  inventoryUnavailable = true
  expect(await invoke('remove-desktop', { target: folderTarget }, confirm)).toMatchObject({
    removed: true,
    scope: 'metadata',
    executionVerdict: 'unverifiable'
  })
  expect(store.getWorktreeMeta(result.worktree.id)).toBeUndefined()
  expect(await readFile(join(path, 'keep'), 'utf8')).toBe('keep')
  const root = await runtime.showManagedWorktree(`path:${path}`)
  await expect(
    invoke(
      'remove-desktop',
      { target: { worktreeId: root.id, executionHostId: 'local', instanceId: root.instanceId } },
      `${root.id}:${root.instanceId}`
    )
  ).rejects.toThrow()
})
it('preserves original IPC coalescing, completion and lifecycle once', async () => {
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'worktrees:remove')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC')
  }
  const args = { worktreeId: target.worktreeId, hostId: 'local' }
  const results = await Promise.all([
    Reflect.apply(callback, undefined, [{}, args]),
    Reflect.apply(callback, undefined, [{}, args])
  ])
  expect(results[0]).toEqual(results[1])
  expect(results[0].removing).not.toBe(true)
  await expect(access(childPath)).rejects.toThrow()
  expect(lifecycle).toHaveBeenCalledTimes(1)
})
it('keeps failed archive refusal separate from force and records an explicit failure waiver', async () => {
  store.updateRepo('fixture', {
    hookSettings: {
      mode: 'override',
      scripts: { setup: '', archive: 'exit 7' },
      commandSourcePolicy: 'local-only'
    }
  })
  await expect(remove({ force: true })).rejects.toThrow('Desktop workspace removal failed.')
  await access(childPath)
  expect(await remove({ allowFailedArchiveHook: true })).toMatchObject({
    removed: true,
    archiveHookFailureWaived: true
  })
})
it('skips an archive hook only with its separate explicit waiver', async () => {
  store.updateRepo('fixture', {
    hookSettings: {
      mode: 'override',
      scripts: { setup: '', archive: 'exit 7' },
      commandSourcePolicy: 'local-only'
    }
  })
  expect(await remove({ skipArchive: true })).toMatchObject({
    removed: true,
    archiveHookFailureWaived: false
  })
})
it('redacts persistence failure after actual removal without claiming rollback', async () => {
  const checkouts = await preview()
  vi.mocked(console.log).mockClear()
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValueOnce(
    new Error('private-save-canary')
  )
  await expect(
    invoke('remove-desktop', { target, expectedCheckout: checkouts.at(-1) })
  ).rejects.toThrow('Desktop workspace removal failed.')
  await expect(access(childPath)).rejects.toThrow()
  expect(console.log).not.toHaveBeenCalled()
})
it('refuses wrong/stale/ambiguous owners, save/service/old peers and private errors', async () => {
  const checkouts = await preview()
  const params = { target, expectedCheckout: checkouts.at(-1) }
  await expect(invoke('remove-desktop', params, 'wrong')).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  await expect(
    invoke('remove-desktop', { ...params, target: { ...target, identityKey: 'stale' } }, 'stale')
  ).rejects.toThrow()
  await expect(
    invoke('remove-desktop', { ...params, target: { ...target, executionHostId: 'ssh:absent' } })
  ).rejects.toThrow()
  store.addRepo({ ...store.getRepos()[0], connectionId: 'absent' })
  await expect(invoke('remove-desktop', params)).rejects.toThrow()
  await access(childPath)
  setDesktopWorktreeRemovalForRpc(null)
  await expect(invoke('remove-desktop', params)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('remove-desktop', params)).rejects.toMatchObject({ code: 'method_not_found' })
})
it('requires explicit separate nested, archive and PTY waivers', () => {
  const target = { worktreeId: 'fixture::child', executionHostId: 'local', identityKey: 'fixture' }
  expect(DesktopWorktreeRemove.safeParse({ target }).success).toBe(true)
  expect(DesktopWorktreeRemove.safeParse({ target, approvedNestedWorktrees: [] }).success).toBe(
    false
  )
  expect(
    DesktopWorktreeRemove.safeParse({ target, skipArchive: true, allowFailedArchiveHook: true })
      .success
  ).toBe(false)
})
