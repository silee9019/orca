import { beforeEach, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { makeWorktree } from './automations-page-fixtures'
import { isAutomationBaseBranchChoice as allowed } from './automation-base-branch-choice'
const { search } = vi.hoisted(() => ({ search: vi.fn(async () => ['feature']) }))
vi.mock('@/runtime/runtime-repo-client', () => ({ searchRuntimeRepoBaseRefs: search }))
const repo: Repo = {
  id: 'repo',
  displayName: 'Repo',
  path: '/fixture',
  badgeColor: '',
  addedAt: 1,
  worktreeBaseRef: 'main'
}
beforeEach(() => search.mockClear())
it('uses the existing picker choices without extra host reads and rejects oversized or missing projects', async () => {
  expect(await allowed('', repo, [], null)).toBe(true)
  expect(await allowed('main', repo, [], null)).toBe(true)
  expect(await allowed('branch', repo, [makeWorktree({ branch: 'refs/heads/branch' })], null)).toBe(
    true
  )
  expect(await allowed('가'.repeat(700), repo, [], null)).toBe(false)
  expect(await allowed('', undefined, [], null)).toBe(false)
  expect(search).not.toHaveBeenCalled()
})
it.each([
  { repo, environment: null, host: 'local' },
  { repo: { ...repo, connectionId: 'ssh-owner' }, environment: null, host: 'ssh:ssh-owner' },
  { repo: { ...repo, executionHostId: 'runtime:host' }, environment: 'host', host: 'runtime:host' }
] satisfies { repo: Repo; environment: string | null; host: string }[])(
  'retains the selected execution host $host for exact ref searches',
  async ({ repo, environment, host }) => {
    expect(await allowed('feature', repo, [], environment)).toBe(true)
    expect(search).toHaveBeenCalledWith(
      { activeRuntimeEnvironmentId: environment },
      'repo',
      'feature',
      30,
      host
    )
    expect(await allowed('missing', repo, [], environment)).toBe(false)
  }
)
