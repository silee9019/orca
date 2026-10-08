import { ctx, store } from './workspace-data-cli-remote-clone-fixture'
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/main/runtime/runtime-linear-command-dependencies', async (original) => ({
  ...(await original<typeof provider>())
}))
import * as provider from '../../src/main/runtime/runtime-linear-command-dependencies'
import { LINEAR_HANDLERS } from '../../src/cli/handlers/linear'
import { LINEAR_AGENT_ACCESS_METHODS } from '../../src/main/runtime/rpc/methods/linear-agent-access'
import { LINEAR_MCP_ISSUE_LIST_METHOD } from '../../src/main/runtime/rpc/methods/linear-issue-list-method'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
async function invoke(action: string, flags: Record<string, string | boolean> = {}) {
  ctx.flags = new Map(Object.entries({ workspace: 'workspace', ...flags }))
  await LINEAR_HANDLERS[`linear ${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  vi.spyOn(provider, 'readLinearIssueContext').mockImplementation(async (request) => ({
    issue: {
      id: 'issue',
      identifier: 'TEST-1',
      title: 'Fixture issue',
      url: 'https://fixture.invalid/issue',
      labels: []
    },
    meta: {
      requested: {
        id: request.input,
        current: request.current === true,
        workspaceId: request.workspaceId,
        include: {
          comments: request.include?.comments === true,
          children: request.include?.children === true,
          attachments: request.include?.attachments === true,
          relations: request.include?.relations === true,
          activity: request.include?.activity === true
        },
        depth: request.depth ?? 0
      },
      resolved: {
        id: 'issue',
        identifier: 'TEST-1',
        workspaceId: 'workspace',
        workspaceName: 'Fixture'
      },
      partial: true,
      includeErrors: [
        {
          include: 'comments',
          code: 'linear_network_error',
          message: 'Fixture section unavailable'
        }
      ],
      sections: { children: { returned: 0, cap: 10, capReached: true, hasMore: true } }
    }
  }))
  vi.spyOn(provider, 'listMcpIssues').mockImplementation(async (request) => ({
    issues: [],
    truncated: true,
    meta: {
      limit: request.limit ?? null,
      returned: 0,
      hasMore: true,
      nextCursor: 'next-fixture',
      orderBy: request.orderBy ?? 'updatedAt',
      workspaceId: request.workspaceId,
      partial: false,
      workspaceErrors: []
    }
  }))
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: [...LINEAR_AGENT_ACCESS_METHODS, LINEAR_MCP_ISSUE_LIST_METHOD]
  })
  vi.mocked(ctx.client.call).mockImplementation(async (method, params) => {
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
})
it('preserves full section/depth requests and partial provider section evidence', async () => {
  const result = await invoke('issue', { id: 'TEST-1', full: true, depth: '2' })
  expect(provider.readLinearIssueContext).toHaveBeenCalledWith(
    expect.objectContaining({
      input: 'TEST-1',
      workspaceId: 'workspace',
      depth: 2,
      include: {
        comments: true,
        children: true,
        attachments: true,
        relations: true,
        activity: true
      }
    }),
    expect.any(Function)
  )
  expect(result.issue.identifier).toBe('TEST-1')
  expect(result.meta).toMatchObject({
    partial: true,
    includeErrors: [{ include: 'comments', code: 'linear_network_error' }],
    sections: { children: { capReached: true, hasMore: true } }
  })
  expect(vi.mocked(ctx.client.call).mock.calls.at(-1)?.[2]?.timeoutMs).toBeGreaterThan(0)
})
it('passes MCP filters, cursor and archive scope through the original list service', async () => {
  const result = await invoke('list-issues', {
    team: 'TEST',
    cycle: 'cycle',
    label: 'Bug',
    limit: '5',
    query: 'fixture',
    state: 'Open',
    cursor: 'fixture-cursor',
    'order-by': 'createdAt',
    project: 'project',
    release: 'release',
    assignee: 'person',
    delegate: 'delegate',
    'parent-id': 'parent',
    priority: '2',
    'created-at': '2026-10-01',
    'updated-at': '2026-10-02',
    'include-archived': true
  })
  expect(provider.listMcpIssues).toHaveBeenCalledExactlyOnceWith({
    team: 'TEST',
    cycle: 'cycle',
    label: 'Bug',
    limit: 5,
    query: 'fixture',
    state: 'Open',
    cursor: 'fixture-cursor',
    orderBy: 'createdAt',
    project: 'project',
    release: 'release',
    assignee: 'person',
    delegate: 'delegate',
    parentId: 'parent',
    priority: 2,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-02',
    includeArchived: true,
    workspaceId: 'workspace'
  })
  expect(result).toMatchObject({
    truncated: true,
    meta: { hasMore: true, nextCursor: 'next-fixture', orderBy: 'createdAt', limit: 5 }
  })
})
it('rejects invalid depth, workspace and filters before any provider request', async () => {
  for (const [command, flags] of [
    ['issue', { id: 'TEST-1', depth: '1' }],
    ['issue', { id: 'TEST-1', workspace: 'all' }],
    ['list-issues', { priority: '5' }],
    ['list-issues', { 'order-by': 'unknown' }]
  ] as const) {
    await expect(invoke(command, flags)).rejects.toThrow()
  }
  expect(ctx.client.call).not.toHaveBeenCalled()
  expect(provider.readLinearIssueContext).not.toHaveBeenCalled()
  expect(provider.listMcpIssues).not.toHaveBeenCalled()
})
it('preserves old peer failure for both commands', async () => {
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('issue', { id: 'TEST-1' })).rejects.toMatchObject({
    code: 'method_not_found'
  })
  await expect(invoke('list-issues')).rejects.toMatchObject({ code: 'method_not_found' })
  expect(provider.readLinearIssueContext).not.toHaveBeenCalled()
  expect(provider.listMcpIssues).not.toHaveBeenCalled()
})
