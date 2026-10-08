import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
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
import { runProcess } from '../../src/shared/child-process/run-process'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { DesktopFileSearchStart } from '../../src/shared/rpc-contract/workspace-file-search-params'
import { WORKSPACE_FILE_SEARCH_HANDLERS } from '../../src/cli/handlers/workspace-file-search'
import {
  WORKSPACE_FILE_SEARCH_METHODS,
  setDesktopFileSearchForRpc
} from '../../src/main/runtime/rpc/methods/workspace-file-search'
import { registerFilesystemSearchHandlers } from '../../src/main/ipc/filesystem/filesystem-search-handlers'
import { createFilesystemHandlerContext } from '../../src/main/ipc/filesystem/filesystem-handler-context'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
import { createFolderWorkspace } from '../../src/main/ipc/worktrees/create/folder-workspace-creation'
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
  await WORKSPACE_FILE_SEARCH_HANDLERS[`file desktop-search-${command}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
async function wait(requestId: string, state: string) {
  await vi.waitFor(async () => expect((await invoke('status', { requestId })).state).toBe(state), {
    timeout: 10000,
    interval: 10
  })
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-file-search-')))
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
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_FILE_SEARCH_METHODS })
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
  setDesktopFileSearchForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
it('searches actual folder files through CLI/RPC/original bundled-ripgrep and pages matches', async () => {
  const request = await invoke('start', { target, query: 'child' })
  await wait(request.requestId, 'completed')
  const result = await invoke('result', { requestId: request.requestId, limit: 1 })
  expect(result.totalMatches).toBe(1)
  expect(result.files[0].relativePath).toBe('child.txt')
  expect(result.files[0].matches[0]).toMatchObject({
    line: 1,
    column: 1,
    matchLength: 5,
    lineContent: 'child'
  })
  expect((await invoke('status', { requestId: request.requestId })).executionVerdict).toBe(
    'unverifiable'
  )
  expect((await invoke('cancel', { requestId: request.requestId })).state).toBe('cancelled')
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
  expect(await readFile(join(root, 'child.txt'), 'utf8')).toBe('child')
})
it('preserves original regex/include/exclude discovery behavior and fixed failure state', async () => {
  await writeFile(join(root, '.gitignore'), 'ignored.txt\n')
  await writeFile(join(root, 'ignored.txt'), 'child')
  let request = await invoke('start', {
    target,
    query: 'chi.*',
    useRegex: true,
    includePattern: '*.txt',
    excludePattern: 'keep.txt'
  })
  await wait(request.requestId, 'completed')
  const result = await invoke('result', { requestId: request.requestId })
  expect(result.files.map((file: { relativePath: string }) => file.relativePath)).toContain(
    'ignored.txt'
  )
  expect(result.files.map((file: { relativePath: string }) => file.relativePath)).toContain(
    'child.txt'
  )
  request = await invoke('start', { target, query: 'child', excludePattern: 'ignored.txt' })
  await wait(request.requestId, 'completed')
  expect(
    (await invoke('result', { requestId: request.requestId })).files.map(
      (file: { relativePath: string }) => file.relativePath
    )
  ).not.toContain('ignored.txt')
  request = await invoke('start', { target, query: '[', useRegex: true })
  await wait(request.requestId, 'failed')
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
})
it('rejects caller authority, stale instances, ambiguous owners and unsupported hosts', async () => {
  for (const extra of [
    { rootPath: root },
    { requestToken: 'renderer' },
    { maxResults: 2001 },
    { query: 7 }
  ]) {
    expect(
      DesktopFileSearchStart.safeParse({
        expectedExecutionHostId: 'local',
        target,
        query: 'child',
        ...extra
      }).success
    ).toBe(false)
  }
  let request = await invoke('start', {
    target: { ...target, instanceId: 'stale' },
    query: 'child'
  })
  await wait(request.requestId, 'failed')
  store.addRepo({
    ...store.getRepos()[0],
    executionHostId: 'ssh:unavailable',
    connectionId: 'unavailable'
  })
  expect(store.getRepos().filter((repo) => repo.id === 'fixture')).toHaveLength(2)
  request = await invoke('start', { target, query: 'child' })
  await wait(request.requestId, 'failed')
})
it('fails explicitly for unavailable Desktop service and old peers', async () => {
  setDesktopFileSearchForRpc(null)
  await expect(invoke('start', { target, query: 'child' })).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('start', { target, query: 'child' })).rejects.toMatchObject({
    code: 'method_not_found'
  })
})

it('searches a real Git checkout selected by its exact host identity', async () => {
  const path = join(directory, 'git')
  await mkdir(path)
  for (const args of [['init'], ['commit', '--allow-empty', '-m', 'Fixture']]) {
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
      cwd: path,
      timeoutMs: 10000,
      maxOutputBytes: 100000
    })
    expect(result.code, result.stderr).toBe(0)
  }
  await writeFile(join(path, 'search.txt'), 'exact Git search')
  store.addRepo({ id: 'git', path, displayName: 'Git', badgeColor: 'blue', addedAt: 1 })
  const workspace = await runtime.showManagedWorktree(`path:${path}`)
  if (!workspace.identity) {
    throw new Error('Missing fixture identity')
  }
  const request = await invoke('start', {
    target: {
      worktreeId: workspace.id,
      identityKey: workspace.identity.key,
      executionHostId: 'local'
    },
    query: 'Git',
    wholeWord: true
  })
  await wait(request.requestId, 'completed')
  expect(
    (await invoke('result', { requestId: request.requestId })).files[0].matches[0]
  ).toMatchObject({ lineContent: 'exact Git search', matchLength: 3 })
})
