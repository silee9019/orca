import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow, ipcMain } from 'electron'
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: class {
    webContents = { send: vi.fn() }
    isDestroyed() {
      return false
    }
  }
}))
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
import { DesktopNestedScanStart } from '../../src/shared/rpc-contract/workspace-nested-scan-params'
import { WORKSPACE_NESTED_SCAN_HANDLERS } from '../../src/cli/handlers/workspace-nested-scan'
import {
  WORKSPACE_NESTED_SCAN_METHODS,
  setDesktopNestedScanForRpc
} from '../../src/main/runtime/rpc/methods/workspace-nested-scan'
import { registerProjectGroupHandlers } from '../../src/main/ipc/repos/project-group-handlers'
import { activeNestedRepoScans } from '../../src/main/ipc/repos/nested-repo-scan-ipc'
import { runProcess } from '../../src/shared/child-process/run-process'
let directory: string,
  root: string,
  store: Store,
  authority: ProfileStateSqliteAuthority,
  runtime: OrcaRuntimeService,
  ctx: HandlerContext
async function invoke(command: string, params: object) {
  const input = join(directory, 'params.json')
  await writeFile(input, JSON.stringify({ expectedExecutionHostId: 'local', ...params }))
  ctx.flags.set('params-file', input)
  await WORKSPACE_NESTED_SCAN_HANDLERS[`project-group desktop-scan-${command}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
async function wait(requestId: string, state: string) {
  await vi.waitFor(async () => expect((await invoke('status', { requestId })).state).toBe(state), {
    timeout: 10000,
    interval: 10
  })
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-cli-nested-scan-')))
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
  root = join(directory, 'parent')
  await mkdir(root)
  await writeFile(join(root, '.gitignore'), 'ignored/\n')
  for (const name of ['one', 'two', 'ignored']) {
    const repo = join(root, name)
    await mkdir(repo)
    const result = await runProcess({
      program: 'git',
      args: ['-c', `core.hooksPath=${devNull}`, '-c', 'commit.gpgsign=false', 'init', repo],
      cwd: root,
      timeoutMs: 10000,
      maxOutputBytes: 100000
    })
    expect(result.code, result.stderr).toBe(0)
  }
  runtime = new OrcaRuntimeService(store)
  registerProjectGroupHandlers(new BrowserWindow(), store)
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_NESTED_SCAN_METHODS })
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
  setDesktopNestedScanForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
it('discovers actual Git repositories with original ignore rules, progress and paged results without importing', async () => {
  const request = await invoke('start', { expectedScanHostId: 'local', path: root })
  await wait(request.requestId, 'completed')
  const result = await invoke('result', { requestId: request.requestId, limit: 1 })
  expect(result.total).toBe(2)
  expect(result.hasMore).toBe(true)
  expect(result.repos[0].path).toBe(join(root, 'one'))
  expect(result.summary).toMatchObject({
    selectedPath: root,
    selectedPathKind: 'non_git_folder',
    truncated: false,
    timeoutMs: 15000
  })
  expect((await invoke('status', { requestId: request.requestId })).progress.repoCount).toBe(2)
  expect(store.getRepos()).toEqual([])
  expect(activeNestedRepoScans.has(request.requestId)).toBe(false)
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'projectGroups:scanNested')?.[1]
  const cancel = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'projectGroups:cancelNestedScan')?.[1]
  if (!callback || !cancel) {
    throw new Error('Missing original IPC')
  }
  const send = vi.fn()
  const original = await Reflect.apply(callback, undefined, [
    { sender: { send } },
    { path: root, scanId: request.requestId }
  ])
  expect(original.repos).toHaveLength(2)
  expect(send).toHaveBeenCalledWith(
    'projectGroups:scanNestedProgress',
    expect.objectContaining({ scanId: request.requestId })
  )
  expect(Reflect.apply(cancel, undefined, [{}, { scanId: request.requestId }])).toBe(false)
  expect((await invoke('status', { requestId: request.requestId })).state).toBe('completed')
  const renderer = new AbortController()
  activeNestedRepoScans.set(request.requestId, renderer)
  expect((await invoke('cancel', { requestId: request.requestId })).state).toBe('cancelled')
  expect(renderer.signal.aborted).toBe(false)
  expect(Reflect.apply(cancel, undefined, [{}, { scanId: request.requestId }])).toBe(true)
  expect(renderer.signal.aborted).toBe(true)
  activeNestedRepoScans.delete(request.requestId)
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
  expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('ignored/\n')
})
it('reports bounded truncation, selected Git root and disconnected SSH without local fallback', async () => {
  let request = await invoke('start', {
    expectedScanHostId: 'local',
    path: root,
    options: { maxRepos: 1 }
  })
  await wait(request.requestId, 'completed')
  expect((await invoke('result', { requestId: request.requestId })).summary.truncated).toBe(true)
  request = await invoke('start', { expectedScanHostId: 'local', path: join(root, 'one') })
  await wait(request.requestId, 'completed')
  expect((await invoke('result', { requestId: request.requestId })).summary.selectedPathKind).toBe(
    'git_repo'
  )
  request = await invoke('start', { expectedScanHostId: 'ssh:unavailable', path: root })
  await wait(request.requestId, 'failed')
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
})
it('rejects caller scan authority/unlimited options, and explicitly fails unavailable service and old peers', async () => {
  for (const extra of [
    { scanId: 'renderer' },
    { connectionId: 'foreign' },
    { options: { timeoutMs: null } },
    { options: { maxRepos: 501 } }
  ]) {
    expect(
      DesktopNestedScanStart.safeParse({
        expectedExecutionHostId: 'local',
        expectedScanHostId: 'local',
        path: root,
        ...extra
      }).success
    ).toBe(false)
  }
  const request = await invoke('start', { expectedScanHostId: 'local', path: 'relative' })
  await wait(request.requestId, 'failed')
  setDesktopNestedScanForRpc(null)
  await expect(invoke('start', { expectedScanHostId: 'local', path: root })).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('start', { expectedScanHostId: 'local', path: root })).rejects.toMatchObject({
    code: 'method_not_found'
  })
})
