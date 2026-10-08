import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runProcess } from '../../src/shared/child-process/run-process'
import { GitBulkPaths } from '../../src/shared/rpc-contract/git-params'
import { WORKSPACE_GIT_HANDLERS } from '../../src/cli/handlers/workspace-git'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { buildWorktree } from '../../src/cli/test-fixtures'
import type { HandlerContext } from '../../src/cli/dispatch'
import { RuntimeGitStagingCommands } from '../../src/main/runtime/runtime-git-staging-commands'

let directory: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

it('stages, unstages and discards only the selected file through the existing Git service', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-git-effect-'))
  const cwd = directory
  const git = async (...args: string[]): Promise<string> => {
    const result = await runProcess({ program: 'git', args, cwd, timeoutMs: 10_000 })
    expect(result.code, result.stderr).toBe(0)
    return result.stdout
  }
  await git('init')
  await writeFile(join(cwd, 'notes.md'), 'original')
  await writeFile(join(cwd, 'keep.md'), 'untouched')
  await git('add', '--', 'notes.md', 'keep.md')
  await git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgSign=false',
    'commit',
    '-m',
    'fixture'
  )
  await writeFile(join(cwd, 'notes.md'), 'changed')
  await writeFile(join(cwd, 'keep.md'), 'preserve dirty state')
  const fixture = buildWorktree(cwd, 'fixture')
  const worktree = {
    ...fixture,
    ...fixture.git,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
  const selector = `id:${worktree.id}`
  const commands = new RuntimeGitStagingCommands({
    resolveRuntimeGitTarget: async (value) => {
      expect(value).toBe(selector)
      return { worktree, executionHostId: 'local' }
    },
    getRuntimeSettings: () => {
      throw new Error('Fixture does not use settings')
    }
  })
  const client = new RuntimeClient(cwd)
  vi.spyOn(client, 'call').mockImplementation(async (method, payload) => {
    const p = GitBulkPaths.parse(payload)
    let result: unknown
    switch (method) {
      case 'git.bulkStage':
        result = await commands.bulkStageRuntimeGitPaths(p.worktree, p.filePaths)
        break
      case 'git.bulkUnstage':
        result = await commands.bulkUnstageRuntimeGitPaths(p.worktree, p.filePaths)
        break
      case 'git.bulkDiscard':
        result = await commands.bulkDiscardRuntimeGitPaths(p.worktree, p.filePaths)
        break
      default:
        throw new Error(`Unexpected fixture method: ${method}`)
    }
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'isolated-fixture' } }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const input = join(cwd, 'input.json')
  await writeFile(input, JSON.stringify({ worktree: selector, filePaths: ['notes.md'] }))
  const ctx: HandlerContext = { client, cwd, json: true, flags: new Map([['params-file', input]]) }
  await WORKSPACE_GIT_HANDLERS['git stage'](ctx)
  expect(await git('diff', '--cached', '--name-only')).toBe('notes.md\n')
  await WORKSPACE_GIT_HANDLERS['git unstage'](ctx)
  expect(await git('diff', '--cached', '--name-only')).toBe('')
  await expect(WORKSPACE_GIT_HANDLERS['git discard'](ctx)).rejects.toThrow('--confirm')
  expect(await readFile(join(cwd, 'notes.md'), 'utf8')).toBe('changed')
  ctx.flags.set('confirm', selector)
  await WORKSPACE_GIT_HANDLERS['git discard'](ctx)
  expect(await readFile(join(cwd, 'notes.md'), 'utf8')).toBe('original')
  expect(await readFile(join(cwd, 'keep.md'), 'utf8')).toBe('preserve dirty state')
})
