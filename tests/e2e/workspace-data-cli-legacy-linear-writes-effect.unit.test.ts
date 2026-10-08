import {
  directory,
  ctx,
  installLinearWriteProviderFixture
} from './workspace-data-cli-linear-write-provider-fixture'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/main/runtime/runtime-linear-command-dependencies', async (original) => ({
  ...(await original<typeof provider>())
}))
import * as provider from '../../src/main/runtime/runtime-linear-command-dependencies'
import { LINEAR_HANDLERS } from '../../src/cli/handlers/linear'
import { RuntimeClientError } from '../../src/cli/runtime-client'
let fixture: ReturnType<typeof installLinearWriteProviderFixture>
const commentId = '00000000-0000-4000-8000-000000000001'
const attachmentId = '00000000-0000-4000-8000-000000000002'
const createdId = '00000000-0000-4000-8000-000000000003'
async function invoke(action: string, flags: Record<string, string | boolean> = {}) {
  ctx.flags = new Map(
    Object.entries({
      ...(action === 'create' ? {} : { id: 'TEST-1' }),
      workspace: 'workspace',
      ...flags
    })
  )
  await LINEAR_HANDLERS[`linear ${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  fixture = installLinearWriteProviderFixture()
})
it('writes a private comment body once and deduplicates its explicit UUID without echoing the body', async () => {
  const body = 'Private fixture comment\nsecond line'
  const path = join(directory, 'comment.md')
  await writeFile(path, body)
  const flags = { 'body-file': path, 'write-id': commentId }
  const result = await invoke('comment add', flags)
  expect(result).toMatchObject({
    comment: { id: commentId },
    meta: {
      workspaceId: 'workspace',
      writeId: commentId,
      bodyChars: body.length,
      deduplicated: false
    }
  })
  expect(fixture.comments.get(commentId)?.body).toBe(body)
  expect(JSON.stringify(result)).not.toContain(body)
  expect((await invoke('comment add', flags)).meta.deduplicated).toBe(true)
  expect(provider.addLinearIssueCommentForAgent).toHaveBeenCalledTimes(1)
})
it('attaches a link with its title once and deduplicates the same write UUID', async () => {
  const flags = {
    url: 'https://fixture.invalid/review/1',
    title: 'Review',
    'write-id': attachmentId
  }
  expect((await invoke('attach', flags)).attachment).toMatchObject({
    id: attachmentId,
    title: 'Review',
    url: flags.url
  })
  expect(fixture.attachments.get(attachmentId)?.title).toBe('Review')
  expect((await invoke('attach', flags)).meta.deduplicated).toBe(true)
  expect(provider.createLinearIssueAttachment).toHaveBeenCalledTimes(1)
})
it('creates an issue for the explicit team/workspace and deduplicates its UUID through original lookups', async () => {
  const path = join(directory, 'issue.md')
  await writeFile(path, 'Created fixture body')
  const flags = { title: 'Created', team: 'TEST', 'body-file': path, 'write-id': createdId }
  expect((await invoke('create', flags)).issue).toMatchObject({
    id: createdId,
    identifier: 'TEST-3',
    title: 'Created'
  })
  expect(fixture.issues.get(createdId)?.description).toBe('Created fixture body')
  expect((await invoke('create', flags)).meta.deduplicated).toBe(true)
  expect(provider.createLinearIssueForAgent).toHaveBeenCalledTimes(1)
})
it('resolves two distinct issues and adds/removes only their requested fixture relation', async () => {
  const flags = { related: 'TEST-2', type: 'blocks' }
  expect((await invoke('relation add', flags)).operation).toBe('add')
  expect(fixture.relations.size).toBe(1)
  expect((await invoke('relation remove', flags)).operation).toBe('remove')
  expect(fixture.relations.size).toBe(0)
  await expect(invoke('relation add', { related: 'TEST-1', type: 'blocks' })).rejects.toThrow()
  expect(provider.writeIssueRelation).toHaveBeenCalledTimes(2)
})
it('keeps an unconfirmed comment write explicit without inventing a provider record', async () => {
  vi.mocked(provider.addLinearIssueCommentForAgent).mockRejectedValue(
    new provider.LinearWriteFailure('unconfirmed', 'Fixture response unavailable')
  )
  await expect(
    invoke('comment add', { body: 'Fixture', 'write-id': commentId })
  ).rejects.toMatchObject({ code: 'linear_write_unconfirmed' })
  expect(fixture.comments.size).toBe(0)
})
it('rejects invalid input before RPC and preserves old peers for all five commands', async () => {
  for (const [action, flags] of [
    ['attach', { url: 'file:///fixture/file' }],
    ['comment add', { body: 'Fixture', 'write-id': 'bad' }],
    ['create', { title: 'Fixture', workspace: 'all' }],
    ['relation add', { related: 'TEST-2', type: 'unknown' }]
  ] as const) {
    await expect(invoke(action, flags)).rejects.toThrow()
  }
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  for (const [action, flags] of [
    ['comment add', { body: 'Fixture' }],
    ['attach', { url: 'https://fixture.invalid/link' }],
    ['create', { title: 'Fixture', team: 'TEST' }],
    ['relation add', { related: 'TEST-2', type: 'blocks' }],
    ['relation remove', { related: 'TEST-2', type: 'blocks' }]
  ] as const) {
    await expect(invoke(action, flags)).rejects.toMatchObject({ code: 'method_not_found' })
  }
})
