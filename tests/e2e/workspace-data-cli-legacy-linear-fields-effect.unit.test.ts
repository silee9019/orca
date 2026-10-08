import { ctx, store } from './workspace-data-cli-remote-clone-fixture'
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/main/runtime/runtime-linear-command-dependencies', async (original) => ({
  ...(await original<typeof provider>())
}))
import * as provider from '../../src/main/runtime/runtime-linear-command-dependencies'
import type { LinearIssueWriteRecord } from '../../src/main/linear/linear-issue-write-support'
import { LINEAR_HANDLERS } from '../../src/cli/handlers/linear'
import { LINEAR_AGENT_ACCESS_METHODS } from '../../src/main/runtime/rpc/methods/linear-agent-access'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
let record: LinearIssueWriteRecord
const labels = [
  { id: 'bug', name: 'Bug', color: '' },
  { id: 'feature', name: 'Feature', color: '' }
]
async function invoke(action: string, flags: Record<string, string | boolean> = {}) {
  ctx.flags = new Map(Object.entries({ workspace: 'workspace', id: 'TEST-1', ...flags }))
  await LINEAR_HANDLERS[`linear ${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  record = {
    id: 'issue',
    identifier: 'TEST-1',
    title: 'Fixture issue',
    url: 'https://fixture.invalid/issue',
    team: { id: 'team', key: 'TEST', name: 'Fixture team' },
    state: null,
    parent: null,
    assignee: null,
    priority: 0,
    estimate: null,
    dueDate: null,
    labelIds: [],
    labels: []
  }
  vi.spyOn(provider, 'readLinearIssueContext').mockImplementation(async (request) => {
    expect(request.input).toBe('TEST-1')
    expect(request.workspaceId).toBe('workspace')
    return {
      issue: { ...structuredClone(record), labels: record.labels ?? [] },
      meta: {
        requested: {
          id: request.input,
          current: false,
          workspaceId: 'workspace',
          include: {
            comments: false,
            children: false,
            attachments: false,
            relations: false,
            activity: false
          },
          depth: 0
        },
        resolved: {
          id: 'issue',
          identifier: 'TEST-1',
          workspaceId: 'workspace',
          workspaceName: 'Fixture'
        },
        partial: false,
        includeErrors: [],
        sections: {}
      }
    }
  })
  vi.spyOn(provider, 'getLinearIssueByUuidForAgent').mockImplementation(async (id, workspaceId) => {
    expect([id, workspaceId]).toEqual(['issue', 'workspace'])
    return structuredClone(record)
  })
  vi.spyOn(provider, 'getLinearTeamLabelsOrThrow').mockResolvedValue(labels)
  vi.spyOn(provider, 'updateLinearIssueForAgent').mockImplementation(
    async (id, updates, workspaceId, options) => {
      expect([id, workspaceId]).toEqual(['issue', 'workspace'])
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      if (updates.assigneeId !== undefined) {
        record.assignee =
          updates.assigneeId === null
            ? null
            : { id: updates.assigneeId, displayName: 'Fixture assignee' }
      }
      if (updates.priority !== undefined) {
        record.priority = updates.priority
      }
      if (updates.estimate !== undefined) {
        record.estimate = updates.estimate
      }
      if (updates.dueDate !== undefined) {
        record.dueDate = updates.dueDate
      }
      if (updates.labelIds !== undefined) {
        record.labelIds = updates.labelIds
        record.labels = labels.filter((label) => updates.labelIds?.includes(label.id))
      }
      return structuredClone(record)
    }
  )
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: LINEAR_AGENT_ACCESS_METHODS
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
it('sets and clears four task fields with original provider confirmation and final reads', async () => {
  expect((await invoke('assignee set', { 'to-id': 'person' })).current.assignee.id).toBe('person')
  expect((await invoke('assignee clear')).current.assignee).toBeNull()
  expect((await invoke('priority set', { to: 'high' })).current.priority).toBe(2)
  expect((await invoke('priority clear')).current.priority).toBe(0)
  expect((await invoke('estimate set', { to: '3' })).current.estimate).toBe(3)
  expect((await invoke('estimate clear')).current.estimate).toBeNull()
  expect((await invoke('due-date set', { to: '2026-10-09' })).current.dueDate).toBe('2026-10-09')
  expect((await invoke('due-date clear')).current.dueDate).toBeNull()
  expect(provider.updateLinearIssueForAgent).toHaveBeenCalledTimes(8)
  expect(provider.getLinearIssueByUuidForAgent).toHaveBeenCalledTimes(16)
})
it('adds, removes and replaces exact resolved labels without changing another field', async () => {
  expect(
    (await invoke('label add', { label: 'bUg' })).current.labels.map(
      (label: { id: string }) => label.id
    )
  ).toEqual(['bug'])
  expect((await invoke('label remove', { label: 'bug' })).current.labels).toEqual([])
  expect(
    (await invoke('label set', { label: 'Feature' })).current.labels.map(
      (label: { id: string }) => label.id
    )
  ).toEqual(['feature'])
  expect(record.priority).toBe(0)
  expect(provider.getLinearTeamLabelsOrThrow).toHaveBeenCalledWith('team', 'workspace')
  await expect(invoke('label add', { label: 'missing' })).rejects.toMatchObject({
    code: 'linear_invalid_label'
  })
  expect(provider.updateLinearIssueForAgent).toHaveBeenCalledTimes(3)
})
it('recognizes an already applied field and refuses a provider response that cannot confirm a change', async () => {
  await invoke('priority set', { to: 'high' })
  expect((await invoke('priority set', { to: 'high' })).meta.alreadySet).toBe(true)
  expect(provider.updateLinearIssueForAgent).toHaveBeenCalledTimes(1)
  vi.mocked(provider.updateLinearIssueForAgent).mockImplementationOnce(async () =>
    structuredClone(record)
  )
  await expect(invoke('priority set', { to: 'urgent' })).rejects.toMatchObject({
    code: 'linear_write_unconfirmed'
  })
  expect(record.priority).toBe(2)
})
it('rejects invalid writes before RPC and keeps an old peer explicit', async () => {
  for (const [action, flags] of [
    ['priority set', { to: 'unknown' }],
    ['estimate set', { to: '-1' }],
    ['due-date set', { to: 'tomorrow' }],
    ['assignee set', {}],
    ['priority clear', { workspace: 'all' }]
  ] as const) {
    await expect(invoke(action, flags)).rejects.toThrow()
  }
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('priority clear')).rejects.toMatchObject({ code: 'method_not_found' })
  expect(provider.updateLinearIssueForAgent).not.toHaveBeenCalled()
})
