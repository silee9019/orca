import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { ipcMain } from 'electron'
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: () => undefined
}))
vi.mock('../../src/main/providers/ssh-git-dispatch', () => ({ getSshGitProvider: () => undefined }))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { DesktopFileListStart } from '../../src/shared/rpc-contract/workspace-file-list-params'
import { WORKSPACE_FILE_LIST_HANDLERS } from '../../src/cli/handlers/workspace-file-list'
import {
  WORKSPACE_FILE_LIST_METHODS,
  setDesktopFileListForRpc
} from '../../src/main/runtime/rpc/methods/workspace-file-list'
import { registerFilesystemSearchHandlers } from '../../src/main/ipc/filesystem/filesystem-search-handlers'
import { createFilesystemHandlerContext } from '../../src/main/ipc/filesystem/filesystem-handler-context'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
import { createFolderWorkspace } from '../../src/main/ipc/worktrees/create/folder-workspace-creation'
import { runProcess } from '../../src/shared/child-process/run-process'
let directory: string,
  root: string,
  store: Store,
  authority: ProfileStateSqliteAuthority,
  runtime: OrcaRuntimeService,
  ctx: HandlerContext
let target: { worktreeId: string; executionHostId: 'local'; instanceId: string }
let cancellations: ReturnType<typeof createSenderScopedRequestCancellations>
async function invoke(command: string, params: object) {
  const input = join(directory, 'params.json')
  await writeFile(input, JSON.stringify({ expectedExecutionHostId: 'local', ...params }))
  ctx.flags.set('params-file', input)
  await WORKSPACE_FILE_LIST_HANDLERS[`file desktop-list-${command}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
async function wait(requestId: string, state: string) {
  await vi.waitFor(async () => expect((await invoke('status', { requestId })).state).toBe(state), {
    timeout: 10000,
    interval: 10
  })
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-file-list-')))
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
  root = join(directory, 'folder')
  await mkdir(root)
  await writeFile(join(root, 'keep.txt'), 'keep')
  await writeFile(join(root, 'other.md'), 'other')
  store.addRepo({
    id: 'fixture',
    path: root,
    displayName: 'Fixture',
    kind: 'folder',
    badgeColor: 'blue',
    addedAt: 1
  })
  const owner = store.getRepos()[0]
  const workspace = createFolderWorkspace(
    { repoId: owner.id, name: 'child' },
    owner,
    store
  ).worktree
  await writeFile(join(workspace.path, 'child.txt'), 'child')
  target = { worktreeId: workspace.id, executionHostId: 'local', instanceId: workspace.instanceId! }
  runtime = new OrcaRuntimeService(store)
  cancellations = createSenderScopedRequestCancellations()
  registerFilesystemSearchHandlers(
    createFilesystemHandlerContext(
      store,
      undefined,
      cancellations,
      createSenderScopedRequestCancellations()
    )
  )
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_FILE_LIST_METHODS })
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
})
afterEach(async () => {
  setDesktopFileListForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
it('lists actual folder files through CLI/RPC/original bundled-ripgrep and preserves IPC cancellation ownership', async () => {
  const request = await invoke('start', { target, nameFilter: 'child' })
  await wait(request.requestId, 'completed')
  const result = await invoke('result', { requestId: request.requestId, limit: 1 })
  expect(result.files).toEqual(['child.txt'])
  expect(result.truncated).toBe(false)
  expect((await invoke('status', { requestId: request.requestId })).executionVerdict).toBe(
    'unverifiable'
  )
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'fs:listFiles')?.[1]
  const cancel = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'fs:cancelListFiles')?.[1]
  if (!callback || !cancel) {
    throw new Error('Missing original IPC')
  }
  const begin = vi.spyOn(cancellations, 'begin'),
    finish = vi.spyOn(cancellations, 'finish'),
    abort = vi.spyOn(cancellations, 'cancel')
  const event = { sender: { id: 1 } }
  expect(
    await Reflect.apply(callback, undefined, [event, { rootPath: root, includeIgnored: false }])
  ).toContain('keep.txt')
  expect(begin).toHaveBeenCalledWith(event, undefined)
  expect(finish).toHaveBeenCalledWith(event, undefined, null)
  Reflect.apply(cancel, undefined, [event, { requestToken: 'renderer-only' }])
  expect(abort).toHaveBeenCalledWith(event, 'renderer-only')
  expect((await invoke('status', { requestId: request.requestId })).state).toBe('completed')
  expect((await invoke('cancel', { requestId: request.requestId })).state).toBe('cancelled')
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
  expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('keep')
})
it('uses the original listing for a real Git identity with ignored discovery and name filter', async () => {
  const gitRoot = join(directory, 'git')
  await mkdir(gitRoot)
  async function git(args: string[]) {
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
      cwd: gitRoot,
      timeoutMs: 10000,
      maxOutputBytes: 100000
    })
    expect(result.code, result.stderr).toBe(0)
  }
  await git(['init'])
  await git(['commit', '--allow-empty', '-m', 'Fixture'])
  await writeFile(join(gitRoot, '.gitignore'), 'ignored.txt\n')
  await writeFile(join(gitRoot, 'ignored.txt'), 'ignored')
  await writeFile(join(gitRoot, 'keep.txt'), 'keep')
  store.addRepo({ id: 'git', path: gitRoot, displayName: 'Git', badgeColor: 'blue', addedAt: 1 })
  const workspace = await runtime.showManagedWorktree(`path:${gitRoot}`)
  if (!workspace.identity) {
    throw new Error('Missing identity')
  }
  const gitTarget = {
    worktreeId: workspace.id,
    executionHostId: 'local',
    identityKey: workspace.identity.key
  }
  let request = await invoke('start', { target: gitTarget, nameFilter: 'keep' })
  await wait(request.requestId, 'completed')
  expect((await invoke('result', { requestId: request.requestId })).files).toEqual(['keep.txt'])
  request = await invoke('start', {
    target: gitTarget,
    includeIgnored: true,
    nameFilter: 'ignored'
  })
  await wait(request.requestId, 'completed')
  expect((await invoke('result', { requestId: request.requestId })).files).toEqual(['ignored.txt'])
})
it('rejects caller authority, stale instances, ambiguous owners and unsupported hosts without leaking errors', async () => {
  expect(
    DesktopFileListStart.safeParse({ expectedExecutionHostId: 'local', target, rootPath: root })
      .success
  ).toBe(false)
  expect(
    DesktopFileListStart.safeParse({
      expectedExecutionHostId: 'local',
      target,
      requestToken: 'renderer'
    }).success
  ).toBe(false)
  expect(
    DesktopFileListStart.safeParse({
      expectedExecutionHostId: 'local',
      target,
      searchQuery: 'ignored'
    }).success
  ).toBe(false)
  let request = await invoke('start', { target: { ...target, instanceId: 'stale' } })
  await wait(request.requestId, 'failed')
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow('No completed')
  store.addRepo({
    ...store.getRepos()[0],
    executionHostId: 'ssh:unavailable',
    connectionId: 'unavailable'
  })
  expect(store.getRepos().filter((repo) => repo.id === 'fixture')).toHaveLength(2)
  request = await invoke('start', { target })
  await wait(request.requestId, 'failed')
  request = await invoke('start', { target: { ...target, executionHostId: 'runtime:unavailable' } })
  await wait(request.requestId, 'failed')
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
    'Selected workspace changed'
  )
})
it('fails explicitly for unavailable Desktop service and old peers', async () => {
  setDesktopFileListForRpc(null)
  await expect(invoke('start', { target })).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('start', { target })).rejects.toMatchObject({ code: 'method_not_found' })
})
