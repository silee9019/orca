import { ctx, store } from './workspace-data-cli-remote-clone-fixture'
import { expect, vi } from 'vitest'
import * as provider from '../../src/main/runtime/runtime-linear-command-dependencies'
import type {
  LinearIssueWriteRecord,
  LinearCommentWriteRecord,
  LinearAttachmentWriteRecord
} from '../../src/main/linear/linear-issue-write-support'
import type { LinearIssueRelation } from '../../src/shared/linear/agent-access'
import { LINEAR_AGENT_ACCESS_METHODS } from '../../src/main/runtime/rpc/methods/linear-agent-access'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
export { directory, ctx } from './workspace-data-cli-remote-clone-fixture'
export function installLinearWriteProviderFixture() {
  const base: LinearIssueWriteRecord = {
    id: 'issue',
    identifier: 'TEST-1',
    title: 'Fixture',
    url: 'https://fixture.invalid/issue',
    team: { id: 'team', key: 'TEST', name: 'Fixture team' },
    state: null,
    parent: null,
    labels: []
  }
  const issues = new Map<string, LinearIssueWriteRecord>([
    [base.id, base],
    ['related', { ...base, id: 'related', identifier: 'TEST-2', title: 'Related' }]
  ])
  const comments = new Map<string, LinearCommentWriteRecord>()
  const attachments = new Map<string, LinearAttachmentWriteRecord>()
  const relations = new Map<string, LinearIssueRelation>()
  vi.spyOn(provider, 'readLinearIssueContext').mockImplementation(async (request) => {
    const issue = [...issues.values()].find((candidate) => candidate.identifier === request.input)
    if (!issue) {
      throw new Error('Fixture issue not found')
    }
    expect(request.workspaceId).toBe('workspace')
    return {
      issue: { ...structuredClone(issue), labels: issue.labels ?? [] },
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
          id: issue.id,
          identifier: issue.identifier,
          workspaceId: 'workspace',
          workspaceName: 'Fixture'
        },
        partial: false,
        includeErrors: [],
        sections: {}
      }
    }
  })
  vi.spyOn(provider, 'getLinearStatus').mockReturnValue({
    connected: true,
    viewer: null,
    workspaces: [
      {
        id: 'workspace',
        organizationId: 'organization',
        organizationName: 'Fixture',
        displayName: 'Fixture',
        email: null
      }
    ]
  })
  vi.spyOn(provider, 'listLinearTeamsOrThrow').mockResolvedValue([
    { id: 'team', key: 'TEST', name: 'Fixture team', workspaceId: 'workspace' }
  ])
  vi.spyOn(provider, 'getLinearIssueByUuidForAgent').mockImplementation(async (id, workspaceId) => {
    expect(workspaceId).toBe('workspace')
    return structuredClone(issues.get(id) ?? null)
  })
  vi.spyOn(provider, 'getLinearCommentByUuidForAgent').mockImplementation(
    async (id, workspaceId) => {
      expect(workspaceId).toBe('workspace')
      return structuredClone(comments.get(id) ?? null)
    }
  )
  vi.spyOn(provider, 'getLinearAttachmentByUuidForAgent').mockImplementation(
    async (id, workspaceId) => {
      expect(workspaceId).toBe('workspace')
      return structuredClone(attachments.get(id) ?? null)
    }
  )
  vi.spyOn(provider, 'addLinearIssueCommentForAgent').mockImplementation(
    async (issueId, body, workspaceId, options) => {
      expect([issueId, workspaceId]).toEqual(['issue', 'workspace'])
      if (!options?.id) {
        throw new Error('Fixture comment requires a write UUID')
      }
      expect(options.signal).toBeInstanceOf(AbortSignal)
      const record: LinearCommentWriteRecord = {
        id: options.id,
        url: 'https://fixture.invalid/comment',
        body,
        issue: base,
        parentId: options.parentId ?? null,
        threadRootId: null
      }
      comments.set(record.id, record)
      return structuredClone(record)
    }
  )
  vi.spyOn(provider, 'createLinearIssueAttachment').mockImplementation(
    async (issueId, input, workspaceId, options) => {
      expect([issueId, workspaceId]).toEqual(['issue', 'workspace'])
      if (!input.id) {
        throw new Error('Fixture attachment requires a write UUID')
      }
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      const record: LinearAttachmentWriteRecord = {
        id: input.id,
        title: input.title,
        url: input.url,
        issue: base
      }
      attachments.set(record.id, record)
      return structuredClone(record)
    }
  )
  vi.spyOn(provider, 'createLinearIssueForAgent').mockImplementation(
    async (teamId, title, description, workspaceId, options) => {
      expect([teamId, workspaceId]).toEqual(['team', 'workspace'])
      if (!options?.id) {
        throw new Error('Fixture issue requires a write UUID')
      }
      expect(options.signal).toBeInstanceOf(AbortSignal)
      const record: LinearIssueWriteRecord = {
        ...base,
        id: options.id,
        identifier: 'TEST-3',
        title,
        description,
        parent: null
      }
      issues.set(record.id, record)
      return structuredClone(record)
    }
  )
  vi.spyOn(provider, 'writeIssueRelation').mockImplementation(async (params) => {
    expect(params.workspaceId).toBe('workspace')
    expect(params.signal).toBeInstanceOf(AbortSignal)
    const key = `${params.issue.id}:${params.relatedIssue.id}:${params.relationship}`
    const exists = relations.has(key)
    const relation: LinearIssueRelation = {
      id: 'relation',
      direction: 'outbound',
      relationship: params.relationship,
      relatedIssue: params.relatedIssue
    }
    if (params.operation === 'add') {
      relations.set(key, relation)
    } else {
      relations.delete(key)
    }
    return {
      issue: params.issue,
      relatedIssue: params.relatedIssue,
      relation,
      operation: params.operation,
      meta: {
        workspaceId: params.workspaceId,
        alreadySet: params.operation === 'add' ? exists : !exists
      }
    }
  })
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
  return { issues, comments, attachments, relations }
}
