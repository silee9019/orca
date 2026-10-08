import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Repo } from '../../src/shared/repo-types'
import { RuntimeRepositoryIssueCommand } from '../../src/main/runtime/runtime-repository-issue-command'
import { RuntimeRepositoryHooksCommands } from '../../src/main/runtime/runtime-repository-hooks-commands'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { REPO_METHODS } from '../../src/main/runtime/rpc/methods/repo'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/main/git/check-ignored-paths', () => ({ checkIgnoredPaths: async () => [] }))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: () => null
}))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = state.call
  }
  return { RuntimeClient, ...errors }
})

let root: string
let repo: Repo
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-session-hooks-'))
  repo = { id: 'fixture', path: root, displayName: 'fixture', badgeColor: '#000', addedAt: 0 }
  const issue = new RuntimeRepositoryIssueCommand({
    resolveRepo: async () => repo,
    getLocalGitArgs: () => []
  })
  const hooks = new RuntimeRepositoryHooksCommands({ resolveRepo: async () => repo })
  const runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'writeRepoIssueCommand').mockImplementation((selector, content) =>
    issue.write(selector, content)
  )
  vi.spyOn(runtime, 'readRepoIssueCommand').mockImplementation((selector) => issue.read(selector))
  vi.spyOn(runtime, 'checkRepoHooks').mockImplementation((selector) =>
    hooks.checkRepoHooks(selector)
  )
  vi.spyOn(runtime, 'inspectRepoSetupScriptImports').mockImplementation((selector) =>
    hooks.inspectRepoSetupScriptImports(selector)
  )
  const rpc = new RpcDispatcher({ runtime, methods: REPO_METHODS })
  state.call.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'fixture', authToken: 'fixture', method, params })
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
async function command(action: string, request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  await main(['agent', 'hooks', action, '--request-file', file, '--json'], root)
}

it('writes, reads and clears a private override without running or echoing its content', async () => {
  await command('issue-write', { repo: repo.id, content: '한글 private command canary' })
  expect(process.exitCode).toBeUndefined()
  expect(await readFile(join(root, '.orca', 'issue-command'), 'utf8')).toBe(
    '한글 private command canary\n'
  )
  expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('.orca\n')
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private command canary')
  await command('issue-read', { repo: repo.id })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).toContain('private command canary')
  await command('issue-write', { repo: repo.id, content: ' ' })
  expect(existsSync(join(root, '.orca', 'issue-command'))).toBe(false)
})
it('fails on an unavailable SSH owner without writing into the client path', async () => {
  repo.connectionId = 'missing-ssh'
  await command('issue-write', { repo: repo.id, content: 'private canary' })
  expect(process.exitCode).toBe(1)
  expect(existsSync(join(root, '.orca'))).toBe(false)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private canary')
})
it('returns a folder workspace hook result without treating an unsupported write as success', async () => {
  repo.kind = 'folder'
  await command('workspace-check', { repo: repo.id })
  expect(process.exitCode).toBeUndefined()
  await command('issue-write', { repo: repo.id, content: 'command' })
  expect(process.exitCode).toBe(1)
  expect(existsSync(join(root, '.orca'))).toBe(false)
})
it('rejects an unavailable SSH hook check as failure', async () => {
  repo.connectionId = 'missing-ssh'
  await command('workspace-check', { repo: repo.id })
  expect(process.exitCode).toBe(1)
})
