import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeRepositoryHooksCommands } from './runtime-repository-hooks-commands'
import { RuntimeRepositoryIssueCommand } from './runtime-repository-issue-command'
import type * as IssueCommandFile from '../issue-command-file'
import { writeIssueCommand } from '../issue-command-file'

const mocks = vi.hoisted(() => ({ provider: vi.fn() }))
vi.mock('../providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: mocks.provider
}))
vi.mock('../git/check-ignored-paths', () => ({ checkIgnoredPaths: async () => [] }))
vi.mock('../issue-command-file', async (importOriginal) => ({
  ...(await importOriginal<typeof IssueCommandFile>()),
  isIssueCommandIgnoredByGit: async () => false
}))
const repo = {
  id: 'remote-fixture',
  path: '/remote/fixture',
  displayName: 'fixture',
  badgeColor: '#000',
  addedAt: 0,
  connectionId: 'fixture-ssh'
}
const hooks = new RuntimeRepositoryHooksCommands({ resolveRepo: async () => repo })
const issue = new RuntimeRepositoryIssueCommand({
  resolveRepo: async () => repo,
  getLocalGitArgs: () => []
})
beforeEach(() => {
  mocks.provider.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
})

it('does not publish a disconnected SSH hook inventory as an empty project', async () => {
  mocks.provider.mockReturnValue(null)
  await expect(hooks.getRepoHooks(repo.id)).rejects.toThrow('unavailable')
  await expect(hooks.inspectRepoSetupScriptImports(repo.id)).rejects.toThrow('unavailable')
})
it('does not claim an SSH issue command write or read when the filesystem is unavailable', async () => {
  mocks.provider.mockReturnValue(null)
  await expect(issue.write(repo.id, 'private command')).rejects.toThrow('unavailable')
  await expect(issue.read(repo.id)).rejects.toThrow('unavailable')
})
it('keeps permission failure distinct from an absent remote command', async () => {
  mocks.provider.mockReturnValue({
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))
  })
  await expect(issue.read(repo.id)).rejects.toThrow('denied')
  await expect(hooks.inspectRepoSetupScriptImports(repo.id)).rejects.toThrow('denied')
})
it('treats confirmed remote absence as no override', async () => {
  mocks.provider.mockReturnValue({
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
  })
  await expect(issue.read(repo.id)).resolves.toMatchObject({ source: 'none' })
})

it('recognizes a remote binary lockfile through metadata instead of reading it as text', async () => {
  const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' })
  const readFile = vi.fn(async (path: string) => {
    if (path.endsWith('/package.json')) {
      return { content: '{}', isBinary: false }
    }
    if (path.endsWith('/bun.lockb')) {
      return { content: '', isBinary: true }
    }
    throw missing()
  })
  mocks.provider.mockReturnValue({
    readFile,
    stat: vi.fn(async (path: string) => {
      if (path.endsWith('/bun.lockb')) {
        return { type: 'file' }
      }
      throw missing()
    })
  })
  expect(await hooks.inspectRepoSetupScriptImports(repo.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ provider: 'package-manager', setup: 'bun install' })
    ])
  )
  expect(readFile).not.toHaveBeenCalledWith('/remote/fixture/bun.lockb')
})

it('does not save a private override when its remote ignore protection cannot be written', async () => {
  const writeFile = vi.fn().mockRejectedValue(new Error('permission denied'))
  mocks.provider.mockReturnValue({
    createDir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue({ content: 'node_modules/\n', isBinary: false }),
    writeFile
  })
  await expect(issue.write(repo.id, 'private command')).rejects.toThrow('permission denied')
  expect(writeFile).toHaveBeenCalledExactlyOnceWith(
    '/remote/fixture/.gitignore',
    'node_modules/\n.orca\n'
  )
})

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'does not save a private override when the local ignore file is read-only',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-hook-ignore-boundary-'))
    const ignore = join(root, '.gitignore')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    writeFileSync(ignore, 'node_modules/\n', { mode: 0o400 })
    try {
      await expect(writeIssueCommand(root, 'private canary')).rejects.toThrow()
      expect(existsSync(join(root, '.orca', 'issue-command'))).toBe(false)
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private canary')
    } finally {
      chmodSync(ignore, 0o600)
      rmSync(root, { recursive: true, force: true })
    }
  }
)
