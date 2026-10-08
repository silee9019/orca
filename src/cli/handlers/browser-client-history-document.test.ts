import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_HISTORY_DOCUMENT_COMMAND_SPECS } from '../specs/browser-client-history-document'
import { BROWSER_CLIENT_HISTORY_DOCUMENT_HANDLERS } from './browser-client-history-document'
const client = new RuntimeClient(join(tmpdir(), 'client-history-fixture'), 60_000, null, null)
const target = {
  worktreeId: 'folder',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const item = { index: 0, worktreeId: 'folder:doc', filePath: '/fixture/doc.html' }
afterEach(() => vi.restoreAllMocks())
async function run(staged = false) {
  const path = staged ? 'client-staged-history-document' : 'client-history-document'
  const parsed = parseArgs([
    'browser',
    path,
    '--viewer',
    'host',
    '--worktree',
    target.worktreeId,
    '--page',
    target.page,
    '--runtime-environment',
    target.environmentId,
    '--remote-page',
    target.remotePageId,
    ...(!staged
      ? [
          '--browser-client',
          'desktop',
          '--browser-host-generation',
          '3',
          '--page-host-generation',
          '4'
        ]
      : []),
    '--index',
    '0',
    '--document-worktree',
    item.worktreeId,
    '--value',
    item.filePath
  ])
  validateCommandAndFlags(BROWSER_CLIENT_HISTORY_DOCUMENT_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_HISTORY_DOCUMENT_HANDLERS[`browser ${path}`]({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it.each([false, true])(
  'parses the exact history command and prints only its checked receipt (staged=%s)',
  async (staged) => {
    const source = staged
      ? {
          kind: 'staged',
          target: {
            worktreeId: target.worktreeId,
            page: target.page,
            environmentId: target.environmentId,
            remotePageId: target.remotePageId
          }
        }
      : { kind: 'materialized', target }
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const metadata = { runtimeId: 'viewer', private: 'secret' }
    const response = {
      id: 'fixture',
      ok: true as const,
      _meta: metadata,
      private: 'secret',
      result: {
        applied: true,
        private: 'secret',
        clientHistoryDocument: {
          source: { ...source, private: 'secret' },
          item: { ...item, private: 'secret' },
          selected: true,
          documentWorkspaceId: 'workspace',
          documentPageId: 'document',
          private: 'secret'
        }
      }
    }
    const call = vi.spyOn(client, 'call').mockResolvedValue(response)
    await run(staged)
    expect(call).toHaveBeenCalledWith('ui.browserViewer', {
      viewer: 'host',
      operation: 'client-history-document',
      source,
      item
    })
    const printed = output.mock.calls.flat().join('')
    expect(printed).not.toContain('secret')
    expect(printed).toContain('documentPageId')
  }
)
it('refuses missing, mismatched, malformed and old-peer receipts', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call')
  const receipt = {
    source: { kind: 'materialized', target },
    item,
    selected: true,
    documentWorkspaceId: 'workspace',
    documentPageId: 'document'
  }
  for (const result of [
    undefined,
    null,
    {},
    { applied: true },
    { applied: true, clientHistoryDocument: { ...receipt, selected: false } },
    {
      applied: true,
      clientHistoryDocument: { ...receipt, item: { ...item, worktreeId: 'foreign' } }
    },
    {
      applied: true,
      clientHistoryDocument: {
        ...receipt,
        source: { kind: 'materialized', target: { ...target, pageHostGeneration: 5 } }
      }
    }
  ]) {
    call.mockResolvedValue({ id: 'fixture', ok: true, _meta: { runtimeId: 'viewer' }, result })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
  expect(output).not.toHaveBeenCalled()
})
