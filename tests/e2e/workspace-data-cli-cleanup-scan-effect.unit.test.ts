import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, mkdir, rm, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import { runProcess } from '../../src/shared/child-process/run-process'
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/memory/pty-registry', () => ({ listRegisteredPtys: () => [] }))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { getWorkspaceCleanupCliScan } from '../../src/main/workspace-cleanup-cli-scan'
import type { WorkspaceCleanupScanRequests } from '../../src/main/workspace-cleanup-scan-requests'
import {
  WORKSPACE_CLEANUP_SCAN_METHODS,
  setDesktopCleanupScanForRpc
} from '../../src/main/runtime/rpc/methods/workspace-cleanup-scan'
import { WORKSPACE_CLEANUP_SCAN_HANDLERS } from '../../src/cli/handlers/workspace-cleanup-scan'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let requests: WorkspaceCleanupScanRequests
let ctx: HandlerContext
function lastResult() {
  const text = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof text !== 'string') {
    throw new Error('Missing fixture output')
  }
  return JSON.parse(text).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-cleanup-owned-'))
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
  requests = getWorkspaceCleanupCliScan(store)
  setDesktopCleanupScanForRpc(requests)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_CLEANUP_SCAN_METHODS
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
})
afterEach(async () => {
  requests.dispose()
  setDesktopCleanupScanForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
async function invoke(command: string, params: object, confirm = false) {
  const input = join(directory, 'input.json')
  await writeFile(input, JSON.stringify(params))
  ctx.flags.set('params-file', input)
  ctx.flags.delete('confirm')
  if (confirm) {
    ctx.flags.set('confirm', 'workspace-cleanup-scan')
  }
  await WORKSPACE_CLEANUP_SCAN_HANDLERS[`workspace-cleanup scan-${command}`](ctx)
  return lastResult()
}
const request = (requestId: string) => ({ requestId, expectedExecutionHostId: 'local' })
it('scans a real isolated Git repo and folder through existing services without deleting or updating the fleet snapshot', async () => {
  const repo = join(directory, 'repo')
  const folder = join(directory, 'folder')
  await mkdir(repo)
  await mkdir(folder)
  const git = await runProcess({
    program: 'git',
    args: ['init', repo],
    cwd: directory,
    timeoutMs: 10000,
    maxOutputBytes: 100000
  })
  expect(git.code).toBe(0)
  await writeFile(join(repo, 'preserved.txt'), 'keep')
  store.addRepo({
    id: 'git-fixture',
    path: repo,
    displayName: 'Git fixture',
    badgeColor: 'fixture',
    addedAt: 1
  })
  store.addRepo({
    id: 'folder-fixture',
    path: folder,
    displayName: 'Folder fixture',
    badgeColor: 'fixture',
    addedAt: 1,
    kind: 'folder'
  })
  const started = await invoke(
    'start',
    { expectedExecutionHostId: 'local', includeAllWorkspaces: true },
    true
  )
  await vi.waitFor(() => expect(requests.status(started.requestId).state).toBe('completed'))
  const status = await invoke('status', request(started.requestId))
  expect(status.state).toBe('completed')
  expect(status).not.toHaveProperty('candidates')
  const result = await invoke('result', request(started.requestId))
  expect(result.candidates.map((row: { repoId: string }) => row.repoId)).toEqual(
    expect.arrayContaining(['git-fixture', 'folder-fixture'])
  )
  expect(result.errors).toEqual([])
  expect(await readFile(join(repo, 'preserved.txt'), 'utf8')).toBe('keep')
  await access(folder)
  expect(getWorkspaceCleanupCliScan(store)).toBe(requests)
  const snapshot = await import('../../src/main/workspace-cleanup-scan-snapshot')
  expect(
    await snapshot.readWorkspaceCleanupScanSnapshot(store.getProfileStorageDirectory())
  ).toBeNull()
  await invoke('cancel', request(started.requestId))
  await expect(invoke('result', request(started.requestId))).rejects.toThrow(/completed/)
})
it('keeps an explicit empty target empty and rejects unrelated request IDs and invalid host or oversized batches before RPC', async () => {
  const started = await invoke('start', { expectedExecutionHostId: 'local', worktreeIds: [] }, true)
  await vi.waitFor(() => expect(requests.status(started.requestId).state).toBe('completed'))
  expect((await invoke('result', request(started.requestId))).candidates).toEqual([])
  await expect(
    invoke('cancel', request('d8ce65ee-b229-4fdc-943a-163d2bcdd411'))
  ).rejects.toMatchObject({ code: 'selector_not_found' })
  const before = vi.mocked(ctx.client.call).mock.calls.length
  await expect(invoke('start', { expectedExecutionHostId: 'ssh:fixture' }, true)).rejects.toThrow()
  await expect(
    invoke(
      'start',
      { expectedExecutionHostId: 'local', worktreeIds: Array.from({ length: 501 }, () => 'r::/a') },
      true
    )
  ).rejects.toThrow()
  await expect(invoke('start', { expectedExecutionHostId: 'local' })).rejects.toThrow()
  expect(vi.mocked(ctx.client.call).mock.calls.length).toBe(before)
})
it('fails explicitly without desktop service and on an old peer', async () => {
  setDesktopCleanupScanForRpc(null)
  await expect(invoke('start', { expectedExecutionHostId: 'local' }, true)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('start', { expectedExecutionHostId: 'local' }, true)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(console.log).not.toHaveBeenCalled()
})
