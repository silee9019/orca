import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_FIND_COMMAND_SPECS } from '../specs/browser-client-find'
import { BROWSER_CLIENT_FIND_HANDLERS } from './browser-client-find'
const client = new RuntimeClient(join(tmpdir(), 'client-find-fixture'), 60_000, null, null)
const target = {
  worktreeId: 'folder',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const state = { query: 'draft', open: true, activeMatch: 0, totalMatches: 0 }
afterEach(() => vi.restoreAllMocks())
async function run(action = 'query', query = 'draft') {
  const parsed = parseArgs([
    'browser',
    'client-find',
    '--viewer',
    'host',
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
    '--action',
    action,
    '--query',
    query
  ])
  validateCommandAndFlags(BROWSER_CLIENT_FIND_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_FIND_HANDLERS['browser client-find']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('prints only the validated exact target and find state', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientFind: {
        target: { ...target, private: 'secret' },
        state: { ...state, private: 'secret' },
        private: 'secret'
      },
      private: 'secret'
    }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-find',
    target,
    action: 'query',
    query: 'draft'
  })
  const printed = output.mock.calls.flat().join('')
  expect(printed).not.toContain('secret')
  expect(printed).toContain('draft')
})
it('rejects missing, stale, malformed and unconfirmed editing receipts', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call')
  for (const clientFind of [
    undefined,
    { target: { ...target, pageHostGeneration: 5 }, state },
    { target, state: { ...state, query: 'different' } },
    { target, state: { ...state, activeMatch: 'one' } }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, clientFind }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
})
it('refuses invalid actions and oversized UTF-8 queries before dispatch', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run('submit')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(run('query', '한'.repeat(800))).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
