import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as appEnvironment from '../../src/shared/app-environment'
import type { WorkspaceCleanupCandidate } from '../../src/shared/workspace-cleanup'
import type { WorkspaceSpaceAnalysis } from '../../src/shared/workspace-space-types'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { persistWorkspaceCleanupScanResult } from '../../src/main/workspace-cleanup-scan-snapshot'
import { persistWorkspaceSpaceAnalysisSnapshot } from '../../src/main/workspace-space-analysis-snapshot'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { WORKSPACE_CACHED_SCAN_METHODS } from '../../src/main/runtime/rpc/methods/workspace-cached-scans'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_CACHED_SCAN_HANDLERS } from '../../src/cli/handlers/workspace-cached-scans'

vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))

let directory: string | undefined
let store: Store | undefined
let authority: ProfileStateSqliteAuthority | undefined
afterEach(async () => {
  store?.freezeWrites()
  await store?.flushAsync()
  authority?.close()
  vi.restoreAllMocks()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

it('reads the selected host profile snapshots without starting a live scan', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-cached-scans-'))
  const fixturePath = directory
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => fixturePath,
    getAppPath: () => fixturePath,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  authority = new ProfileStateSqliteAuthority(join(directory, 'profile-state.db'), 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({
    dataFile: join(directory, 'orca-data.json'),
    profileStateAuthority: authority
  })
  const profileDirectory = store.getProfileStorageDirectory()
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_CACHED_SCAN_METHODS
  })
  const client = new RuntimeClient(join(directory, 'different-client-profile'))
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
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const ctx = { client, cwd: directory, json: true, flags: new Map() }
  for (const command of ['workspace-cleanup cached-scan', 'workspace-space cached-analysis']) {
    await WORKSPACE_CACHED_SCAN_HANDLERS[command](ctx)
    expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('"result": null'))
  }
  const candidate: WorkspaceCleanupCandidate = {
    worktreeId: 'repo::/same-path',
    repoId: 'repo',
    repoName: 'Host repo',
    connectionId: 'fixture',
    executionHostId: 'ssh:fixture',
    displayName: 'Cached remote',
    branch: 'feature',
    path: '/same-path',
    tier: 'ready',
    selectedByDefault: true,
    reasons: ['idle-clean'],
    blockers: [],
    lastActivityAt: 1,
    localContext: {
      terminalTabCount: 0,
      cleanEditorTabCount: 0,
      browserTabCount: 0,
      diffCommentCount: 0,
      newestDiffCommentAt: null,
      retainedDoneAgentCount: 0
    },
    git: { clean: true, upstreamAhead: 0, upstreamBehind: 0, checkedAt: 1 },
    fingerprint: 'cached'
  }
  const cleanup = { scannedAt: 1, candidates: [candidate], errors: [] }
  await persistWorkspaceCleanupScanResult(profileDirectory, { includeAllWorkspaces: true }, cleanup)
  const analysis: WorkspaceSpaceAnalysis = {
    scannedAt: 1,
    totalSizeBytes: 0,
    reclaimableBytes: 0,
    worktreeCount: 0,
    scannedWorktreeCount: 0,
    unavailableWorktreeCount: 0,
    repos: [],
    worktrees: []
  }
  await persistWorkspaceSpaceAnalysisSnapshot(profileDirectory, analysis)
  await WORKSPACE_CACHED_SCAN_HANDLERS['workspace-cleanup cached-scan'](ctx)
  expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0]).result).toEqual(cleanup)
  await WORKSPACE_CACHED_SCAN_HANDLERS['workspace-space cached-analysis'](ctx)
  expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0]).result).toEqual(analysis)
  const cachedFile = join(profileDirectory, 'orca-workspace-cleanup-scan.json')
  const before = await readFile(cachedFile)
  await WORKSPACE_CACHED_SCAN_HANDLERS['workspace-cleanup cached-scan'](ctx)
  expect(await readFile(cachedFile)).toEqual(before)
  await writeFile(cachedFile, 'invalid snapshot')
  await WORKSPACE_CACHED_SCAN_HANDLERS['workspace-cleanup cached-scan'](ctx)
  expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('"result": null'))
  vi.mocked(client.call).mockRejectedValue(new RuntimeClientError('method_not_found', 'old host'))
  const beforeOld = vi.mocked(client.call).mock.calls.length
  await expect(
    WORKSPACE_CACHED_SCAN_HANDLERS['workspace-space cached-analysis'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(client.call).toHaveBeenCalledTimes(beforeOld + 1)
})
