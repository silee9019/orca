import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_DOCUMENT_COMMAND_SPECS } from '../specs/browser-client-document'
import { BROWSER_CLIENT_DOCUMENT_HANDLERS } from './browser-client-document'
const client = new RuntimeClient(join(tmpdir(), 'client-document-fixture'), 60_000, null, null)
const target = {
  worktreeId: 'folder',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const receipt = {
  ...target,
  accepted: true,
  conversion: 'converted',
  documentWorktreeId: target.worktreeId,
  documentPageId: 'document-page',
  documentWorkspaceId: 'document-workspace',
  filePath: join(tmpdir(), 'fixture.html')
}

afterEach(() => vi.restoreAllMocks())
async function run(viewer = 'host', value = './fixture.html', documentWorktreeId?: string) {
  const parsed = parseArgs([
    'browser',
    'client-document',
    '--viewer',
    viewer,
    '--worktree',
    'folder',
    '--page',
    'page',
    '--runtime-environment',
    'paired',
    '--remote-page',
    'remote',
    '--browser-client',
    'desktop',
    '--browser-host-generation',
    '3',
    '--page-host-generation',
    '4',
    '--value',
    value,
    ...(documentWorktreeId !== undefined ? ['--document-worktree', documentWorktreeId] : [])
  ])
  validateCommandAndFlags(BROWSER_CLIENT_DOCUMENT_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_DOCUMENT_HANDLERS['browser client-document']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('dispatches exact identity and prints only the validated public document Store receipt', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientDocument: { ...receipt, private: 'secret' },
      private: 'secret'
    }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-document',
    entry: 'address-bar',
    target,
    value: './fixture.html'
  })
  const printed = output.mock.calls.flat().join('')
  expect(printed).toContain('clientDocument')
  expect(printed).not.toContain('secret')
})
it('rejects old-peer missing, stale, unknown and malformed document acknowledgments', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call')
  for (const clientDocument of [
    undefined,
    { ...receipt, pageHostGeneration: 5 },
    { ...receipt, accepted: false },
    { ...receipt, conversion: 'future-success' },
    { ...receipt, documentPageId: '' },
    { ...receipt, filePath: '' }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, clientDocument }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
})
it('refuses invalid viewers and empty or excessive inputs before dispatch', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run('remote')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(run('host', '   ')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(run('host', 'x'.repeat(8193))).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})

it('requires the explicit destination in a cross-worktree receipt and forwards only that identity', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientDocument: {
        ...receipt,
        conversion: 'opened-in-owning-worktree',
        documentWorktreeId: 'folder:other',
        private: 'secret'
      }
    }
  })
  await run('host', './fixture.html', 'folder:other')
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-document',
    entry: 'address-bar',
    target,
    value: './fixture.html',
    documentWorktreeId: 'folder:other'
  })
  expect(output.mock.calls.flat().join('')).not.toContain('secret')
  call.mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: { applied: true, clientDocument: receipt }
  })
  await expect(run('host', './fixture.html', 'folder:other')).rejects.toMatchObject({
    code: 'runtime_error'
  })
  await expect(run('host', './fixture.html', '   ')).rejects.toMatchObject({
    code: 'invalid_argument'
  })
})
