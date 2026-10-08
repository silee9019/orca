import { directory, ctx, store } from './workspace-data-cli-remote-clone-fixture'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
async function invoke(action: string, flags: Record<string, string | boolean> = {}) {
  ctx.flags = new Map(Object.entries({ id: 'TEST-1', workspace: 'workspace', ...flags }))
  await LINEAR_HANDLERS[`linear ${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  record = {
    id: 'issue',
    identifier: 'TEST-1',
    title: 'Fixture',
    description: 'Original',
    url: 'https://fixture.invalid/issue',
    team: { id: 'team', key: 'TEST', name: 'Fixture team' },
    state: { id: 'open', name: 'Open' },
    parent: null,
    labels: []
  }
  vi.spyOn(provider, 'readLinearIssueContext').mockImplementation(async (request) => ({
    issue: { ...structuredClone(record), labels: record.labels ?? [] },
    meta: {
      requested: {
        id: request.input,
        current: false,
        workspaceId: request.workspaceId,
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
  }))
  vi.spyOn(provider, 'getLinearIssueByUuidForAgent').mockImplementation(async (id, workspaceId) => {
    expect([id, workspaceId]).toEqual(['issue', 'workspace'])
    return structuredClone(record)
  })
  vi.spyOn(provider, 'getLinearTeamStatesOrThrow').mockResolvedValue([
    { id: 'done', name: 'Done', type: 'completed', color: '', position: 1 }
  ])
  vi.spyOn(provider, 'updateLinearIssueForAgent').mockImplementation(
    async (id, updates, workspaceId, options) => {
      expect([id, workspaceId]).toEqual(['issue', 'workspace'])
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      if (updates.stateId === 'done') {
        record.state = { id: 'done', name: 'Done' }
      }
      if (updates.title !== undefined) {
        record.title = updates.title
      }
      if (updates.description !== undefined) {
        record.description = updates.description
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
it('resolves the exact workflow state and avoids repeating an already confirmed update', async () => {
  const result = await invoke('status set', { to: 'dOnE' })
  expect(result).toMatchObject({
    state: { id: 'done', name: 'Done' },
    previousState: { id: 'open' },
    meta: { workspaceId: 'workspace', alreadyInState: false }
  })
  expect(record.state?.id).toBe('done')
  expect((await invoke('status set', { to: 'done' })).meta.alreadyInState).toBe(true)
  expect(provider.updateLinearIssueForAgent).toHaveBeenCalledTimes(1)
  await expect(invoke('status set', { to: 'missing' })).rejects.toMatchObject({
    code: 'linear_invalid_state'
  })
  expect(provider.updateLinearIssueForAgent).toHaveBeenCalledTimes(1)
})
it('reads a private body file and confirms a title/body save once through the original service', async () => {
  const body = 'Fixture body\nsecond line'
  const path = join(directory, 'body.md')
  await writeFile(path, body)
  const result = await invoke('save-issue', { title: 'Renamed', 'body-file': path })
  expect(result).toMatchObject({
    issue: { title: 'Renamed', description: body },
    meta: { workspaceId: 'workspace', created: false }
  })
  expect(record).toMatchObject({ title: 'Renamed', description: body })
  await invoke('save-issue', { title: 'Renamed', 'body-file': path })
  expect(provider.updateLinearIssueForAgent).toHaveBeenCalledTimes(1)
  await expect(invoke('save-issue', { team: 'TEST', title: 'Other' })).rejects.toThrow()
  expect(provider.updateLinearIssueForAgent).toHaveBeenCalledTimes(1)
})
it('refuses unconfirmed state or save responses instead of reporting completion', async () => {
  vi.mocked(provider.updateLinearIssueForAgent).mockImplementation(async () =>
    structuredClone(record)
  )
  await expect(invoke('status set', { to: 'done' })).rejects.toMatchObject({
    code: 'linear_write_unconfirmed'
  })
  await expect(invoke('save-issue', { title: 'Unconfirmed' })).rejects.toMatchObject({
    code: 'linear_write_unconfirmed'
  })
  expect(record).toMatchObject({ title: 'Fixture', state: { id: 'open' } })
})
it('rejects conflicting body input and workspace-all writes before RPC and preserves old peers', async () => {
  await expect(
    invoke('save-issue', { body: 'Body', description: 'Description' })
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(invoke('status set', { to: 'done', workspace: 'all' })).rejects.toThrow()
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('status set', { to: 'done' })).rejects.toMatchObject({
    code: 'method_not_found'
  })
  await expect(invoke('save-issue', { title: 'Renamed' })).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(provider.updateLinearIssueForAgent).not.toHaveBeenCalled()
})
