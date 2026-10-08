import { getWorktreeRemovalInFlightKey } from '../../src/main/ipc/worktrees/removal/worktree-removal-coordinator'
import { agentHookServer } from '../../src/main/agent-hooks/server'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import type { HandlerContext } from '../../src/cli/dispatch'
const fixture = vi.hoisted(() => ({
  teardown: vi.fn(),
  notify: vi.fn(),
  status: vi.fn(),
  history: vi.fn()
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
vi.mock('../../src/main/runtime/worktree-teardown', () => ({
  killAllProcessesForWorktree: fixture.teardown
}))
vi.mock('../../src/main/ipc/pty', () => ({
  getSshPtyProvider: () => undefined,
  getLocalPtyProvider: () => undefined,
  clearProviderPtyState: vi.fn()
}))
vi.mock('../../src/main/ipc/worktree-remote', () => ({
  notifyWorktreesChanged: fixture.notify,
  cleanupUnusedWorktreePushTargetRemoteSsh: vi.fn(),
  cleanupUnusedWorktreePushTargetRemote: vi.fn()
}))
vi.mock('../../src/main/ports/advertised-url-watcher', () => ({
  advertisedUrlWatcher: { forgetWorktree: vi.fn() }
}))
vi.mock('../../src/main/localhost-worktree-label-proxy', () => ({
  localhostWorktreeLabelProxy: { unregisterWorktree: vi.fn() }
}))
vi.mock('../../src/main/terminal-history-deletion', () => ({
  deleteWorktreeHistoryDir: fixture.history
}))
vi.mock('../../src/main/github/pr-refresh-coordinator', () => ({
  pruneWorktreePRRefreshAliases: vi.fn()
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
import { createWorktreeRemovalRegistry } from '../../src/main/ipc/worktrees/worktree-ipc-context'
import { registerWorktreeForgetHandlers } from '../../src/main/ipc/worktrees/removal/register-worktree-forget-handlers'
import {
  WORKSPACE_WORKTREE_FORGET_METHODS,
  setDesktopWorktreeForgetForRpc
} from '../../src/main/runtime/rpc/methods/workspace-worktree-forget'
import { WORKSPACE_WORKTREE_FORGET_HANDLERS } from '../../src/cli/handlers/workspace-worktree-forget'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let worktreeId: string
let child: string
let finishTeardown: (() => void) | null = null
let removalRegistry: ReturnType<typeof createWorktreeRemovalRegistry>
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-forget-'))
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
  child = join(directory, 'child')
  await mkdir(child)
  await writeFile(join(child, 'keep.txt'), 'keep')
  const repo = {
    id: 'shared',
    path: directory,
    displayName: 'Fixture',
    badgeColor: 'blue',
    addedAt: 1
  }
  store.addRepo(repo)
  store.addRepo({ ...repo, connectionId: 'fixture' })
  worktreeId = `shared::${child}`
  store.setWorktreeMetaForHost(worktreeId, 'local', { hostId: 'local', displayName: 'Local' })
  store.setWorktreeMetaForHost(worktreeId, 'ssh:fixture', {
    hostId: 'ssh:fixture',
    displayName: 'Remote'
  })
  fixture.teardown
    .mockReset()
    .mockResolvedValue({ runtimeStopped: 0, providerStopped: 0, registryStopped: 0 })
  fixture.notify.mockClear()
  fixture.status.mockClear()
  vi.spyOn(agentHookServer, 'dropStatusEntriesForRemovedWorktree').mockImplementation(
    fixture.status
  )
  fixture.history.mockClear()
  const runtime = new OrcaRuntimeService(store)
  removalRegistry = createWorktreeRemovalRegistry()
  registerWorktreeForgetHandlers({
    store,
    runtime,
    mainWindow: new BrowserWindow(),
    detectedWorktreeCancellations: createSenderScopedRequestCancellations(),
    worktreeRemovalsInFlight: removalRegistry
  })
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_WORKTREE_FORGET_METHODS })
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
  finishTeardown?.()
  finishTeardown = null
  setDesktopWorktreeForgetForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
async function invoke(params: object, confirm = worktreeId) {
  const input = join(directory, 'input.json')
  await writeFile(input, JSON.stringify(params))
  ctx.flags.set('params-file', input)
  ctx.flags.delete('confirm')
  if (confirm) {
    ctx.flags.set('confirm', confirm)
  }
  await WORKSPACE_WORKTREE_FORGET_HANDLERS['worktree forget-desktop'](ctx)
  const text = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof text !== 'string') {
    throw new Error('Missing fixture output')
  }
  return JSON.parse(text).result
}
it('retires only explicit SSH metadata and retains same-ID local state and real files without claiming process exit', async () => {
  fixture.teardown.mockRejectedValueOnce(new Error('private-teardown-canary'))
  const result = await invoke({
    worktreeId,
    hostId: 'ssh:fixture',
    expectedExecutionHostId: 'local'
  })
  expect(result).toMatchObject({
    forgotten: true,
    hostId: 'ssh:fixture',
    executionVerdict: 'unverifiable'
  })
  expect(store.getWorktreeMetaForHost(worktreeId, 'ssh:fixture')).toBeUndefined()
  expect(store.getWorktreeMetaForHost(worktreeId, 'local')).toMatchObject({ displayName: 'Local' })
  expect(await readFile(join(child, 'keep.txt'), 'utf8')).toBe('keep')
  expect(fixture.teardown).toHaveBeenCalledWith(
    worktreeId,
    expect.objectContaining({
      resolvedConnectionId: 'fixture',
      includeLocalRegistry: false,
      includeProviderInventory: false
    })
  )
  expect(fixture.status).toHaveBeenCalledWith(worktreeId, 'ssh:fixture')
  expect(fixture.history).not.toHaveBeenCalled()
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-teardown-canary')
})
it('rejects a folder project root before teardown and rejects missing confirmation or explicit host before RPC', async () => {
  const folder = {
    id: 'folder',
    path: child,
    displayName: 'Folder',
    badgeColor: 'blue',
    addedAt: 1,
    kind: 'folder' as const
  }
  store.addRepo(folder)
  const rootId = `folder::${child}`
  await expect(
    invoke({ worktreeId: rootId, hostId: 'local', expectedExecutionHostId: 'local' }, rootId)
  ).rejects.toThrow(/project root/)
  expect(fixture.teardown).not.toHaveBeenCalled()
  const before = vi.mocked(ctx.client.call).mock.calls.length
  await expect(
    invoke({ worktreeId, hostId: 'local', expectedExecutionHostId: 'local' }, '')
  ).rejects.toThrow()
  await expect(invoke({ worktreeId, expectedExecutionHostId: 'local' })).rejects.toThrow()
  expect(vi.mocked(ctx.client.call).mock.calls.length).toBe(before)
})
it('fails explicitly without a desktop binding and for an old peer', async () => {
  setDesktopWorktreeForgetForRpc(null)
  const params = { worktreeId, hostId: 'local', expectedExecutionHostId: 'local' }
  await expect(invoke(params)).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke(params)).rejects.toMatchObject({ code: 'method_not_found' })
  expect(console.log).not.toHaveBeenCalled()
})

it('joins duplicate forget requests and refuses a conflicting removal without a second teardown', async () => {
  fixture.teardown.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishTeardown = () =>
          resolve({ runtimeStopped: 0, providerStopped: 0, registryStopped: 0 })
      })
  )
  const params = { worktreeId, hostId: 'local', expectedExecutionHostId: 'local' }
  const first = invoke(params)
  await vi.waitFor(() => expect(fixture.teardown).toHaveBeenCalledTimes(1))
  const second = ctx.client.call('worktree.forgetDesktop', params)
  await Promise.resolve()
  expect(fixture.teardown).toHaveBeenCalledTimes(1)
  finishTeardown?.()
  finishTeardown = null
  await Promise.all([first, second])
  expect(store.getWorktreeMetaForHost(worktreeId, 'local')).toBeUndefined()
  expect(removalRegistry.size).toBe(0)
  store.setWorktreeMetaForHost(worktreeId, 'local', {
    hostId: 'local',
    displayName: 'Restored fixture'
  })
  removalRegistry.set(getWorktreeRemovalInFlightKey(worktreeId, 'local'), {
    optionsKey: 'other-removal',
    promise: Promise.resolve({})
  })
  await expect(invoke(params)).rejects.toThrow(/deletion already in progress/)
  expect(fixture.teardown).toHaveBeenCalledTimes(1)
  expect(store.getWorktreeMetaForHost(worktreeId, 'local')).toMatchObject({
    displayName: 'Restored fixture'
  })
})
