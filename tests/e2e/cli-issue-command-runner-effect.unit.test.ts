import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../config/scripts/vitest-host-ports-setup'
import { initDataPath } from '../../src/main/persistence/loading-store/user-data-path'
import { Store } from '../../src/main/persistence/loading-store/store'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'
import type { Repo } from '../../src/shared/repo-types'
import type { ExecutionHostId } from '../../src/shared/execution-host'
import * as gitRunner from '../../src/main/git/runner'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  return {
    RuntimeClient: class {
      readonly isRemote = false
      call = mocks.call
    },
    ...errors
  }
})
let root: string
let runnerPath: string
let repo: Repo
let hostId: ExecutionHostId
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-issue-runner-'))
  installFakeAppEnvironment({ getPath: () => join(root, 'legacy') })
  initDataPath()
  runnerPath = join(root, 'git-dir', 'orca', 'issue-command-runner.sh')
  repo = { id: 'fixture', path: root, displayName: 'fixture', badgeColor: '#000', addedAt: 0 }
  hostId = 'local'
  const store = new Store({
    dataFile: join(root, 'orca-data.json'),
    serializedState: JSON.stringify({ repos: [repo] })
  })
  const runtime = new OrcaRuntimeService(store)
  Object.defineProperty(runtime, 'resolveWorktreeSelector', {
    value: async () => ({ id: `fixture::${root}`, repoId: repo.id, path: root, hostId })
  })
  vi.spyOn(store, 'getRepo').mockImplementation(() => repo)
  vi.spyOn(gitRunner, 'gitExecFileSync').mockImplementation((args) => {
    expect(args).toEqual(['rev-parse', '--git-path', 'orca/issue-command-runner.sh'])
    return runnerPath
  })
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { ISSUE_COMMAND_RUNNER_METHODS } =
      await import('../../src/main/runtime/rpc/methods/issue-command-runner')
    const response = await new RpcDispatcher({
      runtime,
      methods: ISSUE_COMMAND_RUNNER_METHODS
    }).dispatch({ id: 'runner', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  await main(['agent', 'hooks', 'issue-runner', '--request-file', file, '--json'], root)
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}
it('creates the canonical runner without executing or echoing the private command', async () => {
  const script = `printf 'private runner canary' > '${join(root, 'must-not-exist')}'`
  expect(await command({ worktree: 'fixture', command: script, confirm: true })).toMatchObject({
    ok: true,
    result: { launch: { runnerScriptPath: runnerPath } }
  })
  expect(await readFile(runnerPath, 'utf8')).toContain(script)
  expect(existsSync(join(root, 'must-not-exist'))).toBe(false)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private runner canary')
})
it('requires confirmation before creating or replacing a runner', async () => {
  expect(await command({ worktree: 'fixture', command: 'private runner canary' })).toMatchObject({
    ok: false
  })
  expect(mocks.call).not.toHaveBeenCalled()
  expect(existsSync(runnerPath)).toBe(false)
})
it.each(['ssh:fixture', 'runtime:fixture'] as const)(
  'refuses %s without creating a local runner',
  async (host) => {
    hostId = host
    expect(
      await command({ worktree: 'fixture', command: 'private runner canary', confirm: true })
    ).toMatchObject({ ok: false })
    expect(gitRunner.gitExecFileSync).not.toHaveBeenCalled()
    expect(existsSync(runnerPath)).toBe(false)
  }
)
it('refuses a folder workspace without using its path as a Git repository', async () => {
  repo.kind = 'folder'
  expect(
    await command({ worktree: 'fixture', command: 'private runner canary', confirm: true })
  ).toMatchObject({ ok: false })
  expect(gitRunner.gitExecFileSync).not.toHaveBeenCalled()
})
it('fails once against an old host', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(
    await command({ worktree: 'fixture', command: 'private runner canary', confirm: true })
  ).toMatchObject({ ok: false })
  expect(mocks.call).toHaveBeenCalledTimes(1)
})

it('refuses an SSH repo even if the selected worktree claims to be local', async () => {
  repo.connectionId = 'fixture-ssh'
  expect(
    await command({ worktree: 'fixture', command: 'private runner canary', confirm: true })
  ).toMatchObject({ ok: false })
  expect(gitRunner.gitExecFileSync).not.toHaveBeenCalled()
})
it('rejects an arbitrary destination before RPC and preserves an existing runner without confirmation', async () => {
  await command({ worktree: 'fixture', command: 'first private command', confirm: true })
  const before = await readFile(runnerPath)
  mocks.call.mockClear()
  expect(
    await command({
      worktree: 'fixture',
      command: 'replacement private command',
      destination: root,
      confirm: true
    })
  ).toMatchObject({ ok: false })
  expect(
    await command({ worktree: 'fixture', command: 'replacement private command' })
  ).toMatchObject({ ok: false })
  expect(mocks.call).not.toHaveBeenCalled()
  expect(await readFile(runnerPath)).toEqual(before)
})
