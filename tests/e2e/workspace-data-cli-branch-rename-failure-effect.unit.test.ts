import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWindow } from 'electron'
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type { Repo } from '../../src/shared/repo-types'
import type { RpcDispatchStreamingOptions } from '../../src/main/runtime/rpc/dispatcher-stream-options'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: class {} }))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_BRANCH_RENAME_FAILURE_HANDLERS } from '../../src/cli/handlers/workspace-branch-rename-failure'
import {
  WORKSPACE_BRANCH_RENAME_FAILURE_METHODS,
  setBranchRenameFailureReaderForRpc
} from '../../src/main/runtime/rpc/methods/workspace-branch-rename-failure'
import { registerWorktreeMetadataHandlers } from '../../src/main/ipc/worktrees/metadata/register-worktree-metadata-handlers'
import {
  __resetBranchRenameFailureOutputForTests,
  rememberBranchRenameFailureOutput
} from '../../src/main/agent-hooks/branch-rename-failure-output'
import { captureAgentGenerationFailureOutput } from '../../src/main/text-generation/agent-failure-output'
import { getFolderWorkspaceRootId } from '../../src/main/ipc/worktrees/folder-workspace-model'

let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let worktreeId: string
let callerOptions: RpcDispatchStreamingOptions | undefined
async function run(
  extra: object = {},
  flags: Record<string, string> = { 'output-file': 'out.txt' }
) {
  await writeFile(
    join(directory, 'input.json'),
    JSON.stringify({ expectedExecutionHostId: 'local', worktreeId, ...extra })
  )
  ctx.flags = new Map([['params-file', 'input.json'], ...Object.entries(flags)])
  await WORKSPACE_BRANCH_RENAME_FAILURE_HANDLERS['worktree branch-rename-failure'](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-branch-rename-failure-cli-'))
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
  const repo: Repo = {
    id: 'shared',
    path: directory,
    displayName: 'Folder',
    badgeColor: 'blue',
    addedAt: 1,
    kind: 'folder'
  }
  store.addRepo(repo)
  worktreeId = getFolderWorkspaceRootId(repo)
  const runtime = new OrcaRuntimeService(store)
  registerWorktreeMetadataHandlers({ store, runtime, mainWindow: new BrowserWindow() })
  callerOptions = undefined
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_BRANCH_RENAME_FAILURE_METHODS
  })
  const client = new RuntimeClient('different-client-profile')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch(
      { id: 'fixture', authToken: 'fixture', method, params },
      callerOptions
    )
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  __resetBranchRenameFailureOutputForTests()
})
afterEach(async () => {
  setBranchRenameFailureReaderForRpc(null)
  __resetBranchRenameFailureOutputForTests()
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('writes the on-demand failure diagnostic only to a new private file and never to stdout', async () => {
  rememberBranchRenameFailureOutput(
    worktreeId,
    captureAgentGenerationFailureOutput('claude', 1, 'private stdout line', 'private stderr line')
  )
  const result = await run()
  const written = await readFile(join(directory, 'out.txt'), 'utf8')
  expect(written).toContain('claude exited with code 1.')
  expect(written).toContain('private stderr line')
  expect(result).toEqual({
    found: true,
    outputPath: join(directory, 'out.txt'),
    bytes: Buffer.byteLength(written)
  })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private')
  if (process.platform !== 'win32') {
    expect((await stat(join(directory, 'out.txt'))).mode & 0o777).toBe(0o600)
  }
})

it('reports no recorded failure without creating a file', async () => {
  expect(await run()).toEqual({ found: false, outputPath: null })
  expect(await readdir(directory)).not.toContain('out.txt')
})

it('never overwrites an existing output file or follows its symbolic link', async () => {
  rememberBranchRenameFailureOutput(
    worktreeId,
    captureAgentGenerationFailureOutput('claude', 1, '', 'private stderr line')
  )
  await writeFile(join(directory, 'out.txt'), 'keep')
  await expect(run()).rejects.toMatchObject({ code: 'output_write_failed' })
  expect(await readFile(join(directory, 'out.txt'), 'utf8')).toBe('keep')
  await symlink(join(directory, 'out.txt'), join(directory, 'link.txt'))
  await expect(run({}, { 'output-file': 'link.txt' })).rejects.toMatchObject({
    code: 'output_write_failed'
  })
  expect(await readFile(join(directory, 'out.txt'), 'utf8')).toBe('keep')
})

it('serves only the local socket caller, never a paired, mobile or WebSocket client', async () => {
  rememberBranchRenameFailureOutput(
    worktreeId,
    captureAgentGenerationFailureOutput('claude', 1, '', 'private stderr line')
  )
  for (const options of [
    { connectionId: 'websocket-1' },
    { clientId: 'device-1' },
    { clientKind: 'mobile' as const },
    { clientKind: 'runtime' as const },
    { authenticatedCallerFingerprint: 'federated-environment' }
  ]) {
    callerOptions = options
    await expect(
      run({}, { 'output-file': `denied-${Object.keys(options)[0]}.txt` })
    ).rejects.toMatchObject({
      code: 'runtime_error'
    })
  }
  expect((await readdir(directory)).filter((name) => name.startsWith('denied-'))).toEqual([])
})

it('rejects invalid input before RPC and reports a missing service or old peer without fallback', async () => {
  for (const [extra, flags] of [
    [{ expectedExecutionHostId: 'ssh:fixture' }, { 'output-file': 'out.txt' }],
    [{ worktreeId: '' }, { 'output-file': 'out.txt' }],
    [{ senderId: 1 }, { 'output-file': 'out.txt' }],
    [{}, {}],
    [{}, { 'output-file': '-' }]
  ] as const) {
    vi.mocked(ctx.client.call).mockClear()
    await expect(run(extra, flags)).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(ctx.client.call).not.toHaveBeenCalled()
  }
  setBranchRenameFailureReaderForRpc(null)
  await expect(run()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(run()).rejects.toMatchObject({ code: 'method_not_found' })
  expect(await readdir(directory)).not.toContain('out.txt')
})
