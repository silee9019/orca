import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_SUBMISSION_COMMAND_SPECS } from '../specs/browser-client-submission'
import { BROWSER_CLIENT_SUBMISSION_HANDLERS } from './browser-client-submission'
const client = new RuntimeClient(join(tmpdir(), 'client-submit-fixture'), 60_000, null, null)
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
async function run(viewer = 'host', value = 'orca cli search') {
  const parsed = parseArgs([
    'browser',
    'client-submit',
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
    value
  ])
  validateCommandAndFlags(BROWSER_CLIENT_SUBMISSION_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_SUBMISSION_HANDLERS['browser client-submit']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('dispatches exact identity and prints only the validated public navigation receipt', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientSubmission: { ...receipt, private: 'secret' },
      private: 'secret'
    }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-submission',
    entry: 'address-bar',
    target,
    value: 'orca cli search'
  })
  const printed = output.mock.calls.flat().join('')
  expect(printed).toContain('clientSubmission')
  expect(printed).not.toContain('secret')
})
it('rejects old-peer missing, stale, unfinished and malformed metadata acknowledgments', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call')
  for (const clientSubmission of [
    undefined,
    { ...receipt, pageHostGeneration: 5 },
    { ...receipt, accepted: false },
    { ...receipt, loading: true },
    { ...receipt, metadataRevision: 0 },
    { ...receipt, url: '' }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, clientSubmission }
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
