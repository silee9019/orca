import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_NAVIGATION_COMMAND_SPECS } from '../specs/browser-client-navigation'
import { BROWSER_CLIENT_NAVIGATION_HANDLERS } from './browser-client-navigation'
const client = new RuntimeClient(join(tmpdir(), 'client-navigation-fixture'), 60_000, null, null)
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
  url: 'https://after.test/',
  metadataRevision: 7,
  loading: false,
  accepted: true
}
afterEach(() => vi.restoreAllMocks())
async function run(url = 'https://after.test/') {
  const parsed = parseArgs([
    'browser',
    'client-navigate',
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
    '--browser-client',
    target.browserHostClientId,
    '--browser-host-generation',
    '3',
    '--page-host-generation',
    '4',
    '--url',
    url
  ])
  validateCommandAndFlags(BROWSER_CLIENT_NAVIGATION_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_NAVIGATION_HANDLERS['browser client-navigate']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('projects only a validated public acknowledgment for the exact materialized target', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientNavigation: { ...receipt, private: 'secret' },
      private: 'secret'
    }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-navigation',
    target,
    url: 'https://after.test/'
  })
  expect(output.mock.calls.flat().join('')).not.toContain('secret')
  for (const clientNavigation of [
    undefined,
    { ...receipt, pageHostGeneration: 5 },
    { ...receipt, accepted: false },
    { ...receipt, loading: true },
    { ...receipt, metadataRevision: 0 },
    { ...receipt, metadataRevision: '7' }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, clientNavigation }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
})
it.each([
  'file:///private/file',
  'javascript:alert(1)',
  'https://user:password@example.test/',
  'relative path'
])('refuses %s before viewer dispatch', async (url) => {
  const call = vi.spyOn(client, 'call')
  await expect(run(url)).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
