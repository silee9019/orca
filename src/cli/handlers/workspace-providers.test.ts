import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import type { HandlerContext } from '../dispatch'
import { WORKSPACE_LINEAR_DATA_HANDLERS } from './workspace-linear-data'
import { WORKSPACE_GITHUB_WORK_ITEMS_HANDLERS } from './workspace-github-work-items'
import { WORKSPACE_HOSTED_REVIEW_HANDLERS } from './workspace-hosted-review'
import { WORKSPACE_GITHUB_REVIEW_HANDLERS } from './workspace-github-review'
import { WORKSPACE_GITLAB_HANDLERS } from './workspace-gitlab'
import { WORKSPACE_JIRA_HANDLERS } from './workspace-jira'
import { WORKSPACE_PROJECT_GROUP_HANDLERS } from './workspace-project-group'

let directory: string
let input: string
let ctx: HandlerContext
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-workspace-provider-'))
  input = join(directory, 'input.json')
  ctx = {
    client: new RuntimeClient(directory),
    cwd: directory,
    json: true,
    flags: new Map([['params-file', input]])
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('requires the precise GitHub PR target before requesting a merge', async () => {
  await writeFile(input, JSON.stringify({ repo: 'id:repo', prNumber: 17, method: 'squash' }))
  const call = vi
    .spyOn(ctx.client, 'call')
    .mockResolvedValue({ id: 'req', ok: true, result: {}, _meta: { runtimeId: 'fixture' } })
  ctx.flags.set('confirm', 'id:repo:18')
  await expect(WORKSPACE_GITHUB_REVIEW_HANDLERS['github merge-pr'](ctx)).rejects.toThrow(
    '--confirm'
  )
  expect(call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', 'id:repo:17')
  await WORKSPACE_GITHUB_REVIEW_HANDLERS['github merge-pr'](ctx)
  expect(call).toHaveBeenCalledWith('github.mergePR', {
    repo: 'id:repo',
    prNumber: 17,
    method: 'squash'
  })
})

it('keeps a GitLab project ref on an inline review comment', async () => {
  const params = {
    repo: 'id:repo',
    iid: 3,
    projectRef: { host: 'gitlab.example', path: 'group/project' },
    input: {
      body: 'Review',
      path: 'a.ts',
      line: 4,
      baseSha: 'a'.repeat(40),
      startSha: 'b'.repeat(40),
      headSha: 'c'.repeat(40)
    }
  }
  await writeFile(input, JSON.stringify(params))
  const call = vi
    .spyOn(ctx.client, 'call')
    .mockResolvedValue({ id: 'req', ok: true, result: {}, _meta: { runtimeId: 'fixture' } })
  await WORKSPACE_GITLAB_HANDLERS['gitlab add-mr-inline-comment'](ctx)
  expect(call).toHaveBeenCalledWith('gitlab.addMRInlineComment', params)
})

it('updates Jira issue fields through the existing provider without using GitHub', async () => {
  const params = {
    siteId: 'jira-fixture',
    key: 'DEMO-1',
    updates: { labels: ['cli'], assigneeAccountId: null }
  }
  await writeFile(input, JSON.stringify(params))
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'req',
    ok: true,
    result: { updated: true },
    _meta: { runtimeId: 'fixture' }
  })
  await WORKSPACE_JIRA_HANDLERS['jira update-issue'](ctx)
  expect(call).toHaveBeenCalledWith('jira.updateIssue', params)
})

it('moves a folder project into a group on the selected runtime', async () => {
  const params = { repo: 'id:folder-project', groupId: 'group-2', order: 4 }
  await writeFile(input, JSON.stringify(params))
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'req',
    ok: true,
    result: { repo: { groupId: 'group-2' } },
    _meta: { runtimeId: 'fixture' }
  })
  await WORKSPACE_PROJECT_GROUP_HANDLERS['project-group move-project'](ctx)
  expect(call).toHaveBeenCalledWith('projectGroup.moveProject', params)
})

it('does not report a provider-rejected mutation as CLI success or echo its error payload', async () => {
  await writeFile(
    input,
    JSON.stringify({ key: 'TEST-1', siteId: 'site', updates: { title: 'new' } })
  )
  vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { ok: false, error: 'canary-token' },
    _meta: { runtimeId: 'fixture' }
  })
  await expect(WORKSPACE_JIRA_HANDLERS['jira update-issue'](ctx)).rejects.toMatchObject({
    code: 'operation_failed'
  })
  expect(console.log).not.toHaveBeenCalled()
})

it('preserves a GitLab provider and exact branch confirmation for review creation', async () => {
  const params = {
    repo: 'id:ssh-repo',
    worktree: 'id:ssh-repo::/srv/repo',
    provider: 'gitlab',
    base: 'main',
    head: 'feature',
    title: 'Review title',
    body: 'Review body',
    draft: true
  }
  await writeFile(input, JSON.stringify(params))
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { ok: true, number: 1 },
    _meta: { runtimeId: 'fixture' }
  })
  await expect(WORKSPACE_HOSTED_REVIEW_HANDLERS['review create'](ctx)).rejects.toThrow('--confirm')
  expect(call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', 'id:ssh-repo:gitlab:feature:main')
  await WORKSPACE_HOSTED_REVIEW_HANDLERS['review create'](ctx)
  expect(call).toHaveBeenCalledWith('hostedReview.create', params)
})

it('checks a repository account binding on the selected host without selecting a global account', async () => {
  const params = { repo: 'id:ssh-repo', host: 'github.example.invalid', user: 'fixture' }
  await writeFile(input, JSON.stringify(params))
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { available: true },
    _meta: { runtimeId: 'fixture' }
  })
  await WORKSPACE_GITHUB_WORK_ITEMS_HANDLERS['github validate-account-binding'](ctx)
  expect(call).toHaveBeenCalledWith('github.validateAccountBinding', params)
})

it('requires a concrete Linear workspace and exact project name before creating a project', async () => {
  const params = {
    workspaceId: 'workspace-1',
    name: 'Roadmap',
    teamIds: ['team-1'],
    content: 'Plan'
  }
  await writeFile(input, JSON.stringify(params))
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { ok: true, project: { id: 'project-1' } },
    _meta: { runtimeId: 'fixture' }
  })
  ctx.flags.set('confirm', 'workspace-2:Roadmap')
  await expect(WORKSPACE_LINEAR_DATA_HANDLERS['linear project create'](ctx)).rejects.toThrow(
    '--confirm'
  )
  expect(call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', 'workspace-1:Roadmap')
  await WORKSPACE_LINEAR_DATA_HANDLERS['linear project create'](ctx)
  expect(call).toHaveBeenCalledWith('linear.createProject', params)
  call.mockClear()
  await writeFile(input, JSON.stringify({ ...params, workspaceId: 'all' }))
  await expect(WORKSPACE_LINEAR_DATA_HANDLERS['linear project create'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(call).not.toHaveBeenCalled()
})
