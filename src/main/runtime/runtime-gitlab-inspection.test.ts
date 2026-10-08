import { afterEach, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import * as provider from '../gitlab/client'
import { RuntimeGitLabQueryCommands } from './runtime-gitlab-query-commands'

vi.mock('../gitlab/client', async (original) => ({
  ...(await original<typeof provider>()),
  getIssue: vi.fn().mockResolvedValue(null),
  getMergeRequest: vi.fn().mockResolvedValue(null),
  getMergeRequestForBranch: vi.fn().mockResolvedValue(null),
  getProjectSlug: vi.fn().mockResolvedValue({ host: 'gitlab.example.invalid', path: 'team/repo' }),
  listAssignableUsers: vi
    .fn()
    .mockResolvedValue([{ username: 'member', name: null, avatarUrl: '' }]),
  getAuthenticatedViewer: vi.fn().mockResolvedValue({ username: 'host-user', email: null })
}))

afterEach(() => vi.clearAllMocks())

const repo: Repo = {
  id: 'repo',
  path: '/srv/repo',
  displayName: 'repo',
  badgeColor: 'blue',
  addedAt: 1,
  connectionId: 'ssh-fixture',
  issueSourcePreference: 'origin'
}

it('preserves SSH repo identity and the original GitLab lookup contracts', async () => {
  const queries = new RuntimeGitLabQueryCommands({
    resolveRepo: async () => repo,
    getLocalGitArgs: () => [],
    recordProjectRecent: vi.fn()
  })
  expect(await queries.getGitLabRepoIssue('id:repo', 7)).toBeNull()
  expect(await queries.getGitLabRepoMergeRequest('id:repo', 8)).toBeNull()
  expect(await queries.getGitLabRepoMergeRequestForBranch('id:repo', 'feature', 8)).toBeNull()
  expect(await queries.getGitLabRepoProjectSlug('id:repo')).toEqual({
    host: 'gitlab.example.invalid',
    path: 'team/repo'
  })
  expect(await queries.listGitLabRepoAssignableUsers('id:repo')).toEqual([
    { username: 'member', name: null, avatarUrl: '' }
  ])
  expect(provider.getIssue).toHaveBeenCalledWith('/srv/repo', 7, 'ssh-fixture')
  expect(provider.getMergeRequest).toHaveBeenCalledWith('/srv/repo', 8, 'ssh-fixture', {})
  expect(provider.getMergeRequestForBranch).toHaveBeenCalledWith(
    '/srv/repo',
    'feature',
    8,
    'ssh-fixture',
    {}
  )
  expect(provider.getProjectSlug).toHaveBeenCalledWith('/srv/repo', 'ssh-fixture', {})
  expect(provider.listAssignableUsers).toHaveBeenCalledWith('/srv/repo', 'origin', 'ssh-fixture')
})

it('passes WSL execution options without rewriting host paths', async () => {
  const queries = new RuntimeGitLabQueryCommands({
    resolveRepo: async () => ({ ...repo, connectionId: null }),
    getLocalGitArgs: () => [{ wslDistro: 'Ubuntu' }],
    recordProjectRecent: vi.fn()
  })
  await queries.getGitLabRepoIssue('id:repo', 7)
  await queries.getGitLabRepoMergeRequest('id:repo', 8)
  await queries.getGitLabRepoMergeRequestForBranch('id:repo', 'feature')
  await queries.getGitLabRepoProjectSlug('id:repo')
  await queries.listGitLabRepoAssignableUsers('id:repo')
  expect(provider.getIssue).toHaveBeenCalledWith('/srv/repo', 7, null, { wslDistro: 'Ubuntu' })
  expect(provider.getMergeRequest).toHaveBeenCalledWith('/srv/repo', 8, null, {
    localGitExecOptions: { wslDistro: 'Ubuntu' }
  })
  expect(provider.getMergeRequestForBranch).toHaveBeenCalledWith(
    '/srv/repo',
    'feature',
    null,
    null,
    { localGitExecOptions: { wslDistro: 'Ubuntu' } }
  )
  expect(provider.getProjectSlug).toHaveBeenCalledWith('/srv/repo', null, {
    localGitExecOptions: { wslDistro: 'Ubuntu' }
  })
  expect(provider.listAssignableUsers).toHaveBeenCalledWith('/srv/repo', 'origin', null, {
    wslDistro: 'Ubuntu'
  })
})

it('rejects an unavailable repo before provider access while viewer uses runtime credentials', async () => {
  const queries = new RuntimeGitLabQueryCommands({
    resolveRepo: async () => {
      throw new Error('repo_not_found')
    },
    getLocalGitArgs: () => [],
    recordProjectRecent: vi.fn()
  })
  await expect(queries.getGitLabRepoIssue('missing', 7)).rejects.toThrow('repo_not_found')
  expect(provider.getIssue).not.toHaveBeenCalled()
  expect(await queries.getGitLabViewer()).toEqual({ username: 'host-user', email: null })
  expect(provider.getAuthenticatedViewer).toHaveBeenCalledExactlyOnceWith()
})
