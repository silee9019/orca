import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import type { HandlerContext } from '../../src/cli/dispatch'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: () => undefined
}))
vi.mock('../../src/main/providers/ssh-git-dispatch', () => ({ getSshGitProvider: () => undefined }))
import * as appEnvironment from '../../src/shared/app-environment'
import { DEFAULT_REPO_BADGE_COLOR } from '../../src/shared/constants'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { registerWorkspaceSpaceHandlers } from '../../src/main/ipc/workspace-space'
import { getWorkspaceSpaceScanController } from '../../src/main/workspace-space-scan-service'
import { readWorkspaceSpaceAnalysisSnapshot } from '../../src/main/workspace-space-analysis-snapshot'
import {
  WORKSPACE_SPACE_SCAN_METHODS,
  setWorkspaceSpaceScanForRpc
} from '../../src/main/runtime/rpc/methods/workspace-space-scan'
import { WORKSPACE_SPACE_SCAN_HANDLERS } from '../../src/cli/handlers/workspace-space-scan'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
afterEach(async () => {
  if (store) {
    getWorkspaceSpaceScanController(store).disposeCli()
  }
  setWorkspaceSpaceScanForRpc(null)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})
it('measures a real isolated folder, preserves unavailable SSH ownership, pages results and reuses the original IPC/snapshot', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-space-scan-'))
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
  const folder = join(directory, 'folder')
  await mkdir(folder)
  await writeFile(join(folder, 'keep.txt'), 'keep')
  await writeFile(join(folder, 'data.bin'), Buffer.alloc(8192, 1))
  store.addRepo({
    id: 'local',
    path: folder,
    displayName: 'Local',
    kind: 'folder',
    badgeColor: DEFAULT_REPO_BADGE_COLOR,
    addedAt: 1
  })
  store.addRepo({
    id: 'remote',
    path: folder,
    displayName: 'Remote',
    kind: 'folder',
    badgeColor: DEFAULT_REPO_BADGE_COLOR,
    addedAt: 1,
    connectionId: 'unavailable',
    executionHostId: 'ssh:unavailable'
  })
  registerWorkspaceSpaceHandlers(store)
  const controller = getWorkspaceSpaceScanController(store)
  registerWorkspaceSpaceHandlers(store)
  expect(getWorkspaceSpaceScanController(store)).toBe(controller)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_SPACE_SCAN_METHODS
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
  const ctx: HandlerContext = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  async function invoke(command: string, params: object, confirm = '') {
    const input = join(directory, 'params.json')
    await writeFile(input, JSON.stringify(params))
    ctx.flags.set('params-file', input)
    ctx.flags.delete('confirm')
    if (confirm) {
      ctx.flags.set('confirm', confirm)
    }
    await WORKSPACE_SPACE_SCAN_HANDLERS[`workspace-space scan-${command}`](ctx)
    const text = vi.mocked(console.log).mock.calls.at(-1)?.[0]
    if (typeof text !== 'string') {
      throw new Error('Missing fixture result')
    }
    return JSON.parse(text).result
  }
  await expect(invoke('start', { expectedExecutionHostId: 'local' })).rejects.toThrow()
  expect(client.call).not.toHaveBeenCalled()
  const request = await invoke(
    'start',
    { expectedExecutionHostId: 'local' },
    'workspace-space-scan'
  )
  const params = { requestId: request.requestId, expectedExecutionHostId: 'local' }
  await vi.waitFor(
    async () => {
      expect((await invoke('status', params)).state).toBe('completed')
    },
    { timeout: 5000, interval: 10 }
  )
  const result = await invoke('result', { ...params, limit: 1 })
  expect(result.repoTotal).toBe(2)
  expect(result.worktreeTotal).toBe(2)
  expect(result.worktrees).toHaveLength(1)
  expect(result.hasMoreWorktrees).toBe(true)
  expect(result.worktrees[0]).toMatchObject({ repoId: 'local', status: 'ok' })
  expect(result.worktrees[0].sizeBytes).toBeGreaterThanOrEqual(8192)
  expect(result.worktrees[0].topLevelItemCount).toBeGreaterThan(0)
  expect(result.worktrees[0]).not.toHaveProperty('topLevelItems')
  const remote = await invoke('result', { ...params, worktreeOffset: 1, limit: 1 })
  expect(remote.worktrees[0]).toMatchObject({
    repoId: 'remote',
    executionHostId: 'ssh:unavailable',
    status: 'unavailable',
    sizeBytes: 0,
    error: 'Selected host analysis unavailable.'
  })
  expect(await readFile(join(folder, 'keep.txt'), 'utf8')).toBe('keep')
  await vi.waitFor(async () => {
    expect(
      await readWorkspaceSpaceAnalysisSnapshot(store.getProfileStorageDirectory())
    ).not.toBeNull()
  })
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'workspaceSpace:analyze')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC callback')
  }
  const send = vi.fn()
  const ui = await Reflect.apply(callback, undefined, [
    { sender: { isDestroyed: () => false, send } }
  ])
  expect(ui.ok).toBe(true)
  expect(ui.analysis.worktrees).toHaveLength(2)
  expect(send).toHaveBeenCalledWith('workspaceSpace:progress', expect.any(Object))
  await vi.waitFor(async () => {
    expect(
      (await readWorkspaceSpaceAnalysisSnapshot(store.getProfileStorageDirectory()))?.scannedAt
    ).toBe(ui.analysis.scannedAt)
  })
  expect((await invoke('cancel', params)).state).toBe('cancelled')
  await expect(invoke('result', params)).rejects.toThrow()
  await expect(
    invoke('status', { ...params, requestId: '00000000-0000-4000-8000-000000000000' })
  ).rejects.toMatchObject({ code: 'selector_not_found' })
  setWorkspaceSpaceScanForRpc(null)
  await expect(invoke('status', params)).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(client.call).mockRejectedValue(new RuntimeClientError('method_not_found', 'Old peer'))
  await expect(invoke('status', params)).rejects.toMatchObject({ code: 'method_not_found' })
  await store.flushAsync()
})
