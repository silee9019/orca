import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IssueUpdate } from '../../src/shared/rpc-contract/linear-params'
import type { HandlerContext } from '../../src/cli/dispatch'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_LINEAR_DATA_HANDLERS } from '../../src/cli/handlers/workspace-linear-data'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { LINEAR_METHODS } from '../../src/main/runtime/rpc/methods/linear'
import { WORKSPACE_LINEAR_ISSUE_FIELD_METHODS } from '../../src/main/runtime/rpc/methods/workspace-linear-issue-fields'

let directory: string
let input: string
let output: string
let ctx: HandlerContext
let dispatcher: RpcDispatcher
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-linear-issue-'))
  input = join(directory, 'input.json')
  output = join(directory, 'host-effects.jsonl')
  const record = async (method: string, params: unknown) => {
    await writeFile(output, `${JSON.stringify({ method, params })}\n`, { flag: 'a' })
  }
  const runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'linearCreateIssue').mockImplementation(
    async (teamId, title, description, workspaceId, parentIssueId, projectId, options) => {
      await record('createIssue', {
        teamId,
        title,
        description,
        workspaceId,
        parentIssueId,
        projectId,
        ...options
      })
      return {
        ok: true,
        id: 'issue',
        identifier: 'TEST-1',
        title,
        url: 'https://fixture.invalid/issue'
      }
    }
  )
  vi.spyOn(runtime, 'linearUpdateIssue').mockImplementation(async (id, updates, workspaceId) => {
    await record('updateIssue', { id, updates, workspaceId })
    return { ok: true }
  })
  vi.spyOn(runtime, 'linearAddIssueComment').mockImplementation(
    async (issueId, body, workspaceId) => {
      await record('addIssueComment', { issueId, body, workspaceId })
      return { ok: true, id: 'comment' }
    }
  )
  vi.spyOn(runtime, 'linearGetIssue').mockImplementation(async (id, workspaceId) => {
    await record('getIssue', { id, workspaceId })
    return null
  })
  vi.spyOn(runtime, 'linearListIssues').mockImplementation(
    async (filter, limit, workspaceId, options) => {
      await record('listIssues', { filter, limit, workspaceId, ...options })
      return { items: [] }
    }
  )
  vi.spyOn(runtime, 'linearSearchIssues').mockImplementation(async (query, limit, workspaceId) => {
    await record('searchIssues', { query, limit, workspaceId })
    return []
  })
  vi.spyOn(runtime, 'linearListProjects').mockImplementation(
    async (query, limit, workspaceId, force) => {
      await record('listProjects', { query, limit, workspaceId, force })
      return { items: [] }
    }
  )
  vi.spyOn(runtime, 'linearListTeams').mockImplementation(async (workspaceId) => {
    await record('listTeams', { workspaceId })
    return []
  })
  vi.spyOn(runtime, 'linearTeamStates').mockImplementation(async (teamId, workspaceId) => {
    await record('teamStates', { teamId, workspaceId })
    return []
  })
  vi.spyOn(runtime, 'linearTeamLabels').mockImplementation(async (teamId, workspaceId) => {
    await record('teamLabels', { teamId, workspaceId })
    return []
  })
  vi.spyOn(runtime, 'linearTeamMembers').mockImplementation(async (teamId, workspaceId) => {
    await record('teamMembers', { teamId, workspaceId })
    return []
  })
  dispatcher = new RpcDispatcher({
    runtime,
    methods: [...LINEAR_METHODS, ...WORKSPACE_LINEAR_ISSUE_FIELD_METHODS]
  })
  const client = new RuntimeClient(join(directory, 'client-home'))
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
  ctx = { client, cwd: directory, json: true, flags: new Map([['params-file', input]]) }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('preserves the original Linear due date and parent update fields including clear values', () => {
  for (const updates of [
    { dueDate: '2026-10-09', parentId: 'parent' },
    { dueDate: null, parentId: null }
  ]) {
    expect(IssueUpdate.parse({ id: 'issue', workspaceId: 'workspace', updates }).updates).toEqual(
      updates
    )
  }
})

it('routes the eleven original API contracts through real CLI/RPC validation to host effects', async () => {
  const attributeFilter = {
    stateIds: [],
    priorities: [1],
    assignee: { kind: 'unassigned' },
    labelIds: []
  }
  const updates = {
    dueDate: '2026-10-09',
    parentId: 'parent',
    assigneeId: null,
    estimate: null,
    projectId: null
  }
  const cases = [
    {
      command: 'create-issue',
      params: {
        workspaceId: 'workspace',
        teamId: 'team',
        title: 'Created',
        stateId: 'state',
        priority: 1,
        labelIds: ['label']
      },
      confirm: 'workspace:team'
    },
    {
      command: 'update-issue',
      params: { workspaceId: 'workspace', id: 'issue', updates },
      confirm: 'workspace:issue'
    },
    {
      command: 'add-issue-comment',
      params: { workspaceId: 'workspace', issueId: 'issue', body: 'Comment' },
      confirm: 'workspace:issue'
    },
    { command: 'get-issue', params: { workspaceId: 'workspace', id: 'issue' } },
    {
      command: 'list-workspace-issues',
      params: { workspaceId: 'workspace', filter: 'all', attributeFilter }
    },
    { command: 'search-issues', params: { workspaceId: 'workspace', query: 'search' } },
    { command: 'list-projects', params: { workspaceId: 'workspace', force: true } },
    { command: 'list-teams', params: { workspaceId: 'workspace' } },
    { command: 'team-states', params: { workspaceId: 'workspace', teamId: 'team' } },
    { command: 'team-labels', params: { workspaceId: 'workspace', teamId: 'team' } },
    { command: 'team-members', params: { workspaceId: 'workspace', teamId: 'team' } }
  ]
  for (const entry of cases) {
    await writeFile(input, JSON.stringify(entry.params))
    ctx.flags.delete('confirm')
    if (entry.confirm) {
      ctx.flags.set('confirm', entry.confirm)
    }
    await WORKSPACE_LINEAR_DATA_HANDLERS[`linear ${entry.command}`](ctx)
  }
  const effects = (await readFile(output, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(effects).toHaveLength(11)
  expect(effects[1]).toEqual({
    method: 'updateIssue',
    params: { workspaceId: 'workspace', id: 'issue', updates }
  })
  expect(effects[4]).toMatchObject({ method: 'listIssues', params: { attributeFilter } })
  expect(effects[6]).toMatchObject({ method: 'listProjects', params: { force: true } })
  expect(ctx.client.call).toHaveBeenCalledWith('linear.updateIssueFields', expect.any(Object))
  const response = await dispatcher.dispatch({
    id: 'legacy',
    authToken: 'fixture',
    method: 'linear.updateIssue',
    params: { workspaceId: 'workspace', id: 'issue', updates: { dueDate: null, parentId: null } }
  })
  expect(response.ok).toBe(true)
  expect((await readFile(output, 'utf8')).trim().split('\n').at(-1)).toContain(
    '"dueDate":null,"parentId":null'
  )
})

it('requires concrete workspaces and exact mutation confirmation before any host effect', async () => {
  for (const workspaceId of [undefined, 'all', 'workspace']) {
    await writeFile(
      input,
      JSON.stringify({ workspaceId, id: 'issue', updates: { dueDate: '2026-10-09' } })
    )
    ctx.flags.set('confirm', 'wrong')
    await expect(WORKSPACE_LINEAR_DATA_HANDLERS['linear update-issue'](ctx)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
  }
  ctx.flags.set('confirm', 'workspace:issue')
  await writeFile(
    input,
    JSON.stringify({ workspaceId: 'workspace', id: 'issue', updates: { dueDate: 'tomorrow' } })
  )
  await expect(WORKSPACE_LINEAR_DATA_HANDLERS['linear update-issue'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('fails on an older field-update host without falling back to a silently stripping schema', async () => {
  await writeFile(
    input,
    JSON.stringify({
      workspaceId: 'workspace',
      id: 'issue',
      updates: { dueDate: null, parentId: null }
    })
  )
  ctx.flags.set('confirm', 'workspace:issue')
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old peer')
  )
  await expect(WORKSPACE_LINEAR_DATA_HANDLERS['linear update-issue'](ctx)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(ctx.client.call).toHaveBeenCalledExactlyOnceWith(
    'linear.updateIssueFields',
    expect.any(Object)
  )
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
})
