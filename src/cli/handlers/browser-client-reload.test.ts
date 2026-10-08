import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_RELOAD_COMMAND_SPECS } from '../specs/browser-client-reload'
import { BROWSER_CLIENT_RELOAD_HANDLERS } from './browser-client-reload'
const client = new RuntimeClient(join(tmpdir(), 'client-reload-fixture'), 60_000, null, null)
const target = {
  worktreeId: 'folder',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
afterEach(() => vi.restoreAllMocks())
async function run(viewer = 'host') {
  const parsed = parseArgs([
    'browser',
    'client-reload',
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
    '4'
  ])
  validateCommandAndFlags(BROWSER_CLIENT_RELOAD_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_RELOAD_HANDLERS['browser client-reload']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('prints only the validated exact target and reload state', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientReload: {
        target: { ...target, private: 'secret' },
        accepted: true,
        loading: true,
        completionObserved: false,
        private: 'secret'
      },
      private: 'secret'
    }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-reload',
    target,
    entry: 'context-menu'
  })
  const printed = output.mock.calls.flat().join('')
  expect(printed).not.toContain('secret')
  expect(printed).toContain('completionObserved')
})
it('rejects missing, stale, malformed and unconfirmed editing receipts', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call')
  for (const clientReload of [
    undefined,
    {
      target: { ...target, pageHostGeneration: 5 },
      accepted: true,
      loading: true,
      completionObserved: false
    },
    { target, accepted: false, loading: true, completionObserved: false },
    { target, accepted: true, loading: 'true', completionObserved: false },
    { target, accepted: true, loading: true, completionObserved: true }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, clientReload }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
})
it('refuses an invalid viewer before dispatch', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run('remote')).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
