import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_PAIRED_NEW_TAB_COMMAND_SPECS } from '../specs/browser-paired-new-tab'
import { BROWSER_PAIRED_NEW_TAB_HANDLERS } from './browser-paired-new-tab'
const client = new RuntimeClient(tmpdir())
const target = {
  worktree: 'folder:fixture',
  group: 'group',
  executionHostId: 'runtime:env',
  environmentId: 'env',
  pairingRevision: 7
}
const state = {
  target,
  workspace: 'workspace',
  page: 'page',
  unifiedTab: 'tab',
  remotePageId: 'new-page',
  materialized: true,
  guestRegistrationVerified: false
}
afterEach(() => vi.restoreAllMocks())
async function run(json = true, confirm = true) {
  const specs = BROWSER_PAIRED_NEW_TAB_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'new-ui-paired',
      '--viewer',
      'host',
      '--worktree',
      'folder:fixture',
      '--group',
      'group',
      '--execution-host',
      'runtime:env',
      '--runtime-environment',
      'env',
      '--pairing-revision',
      '7',
      '--confirm'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  parsed.flags.set('confirm', confirm)
  await BROWSER_PAIRED_NEW_TAB_HANDLERS['browser new-ui-paired']({
    ...parsed,
    client,
    cwd: tmpdir(),
    json
  })
}
it.each([
  undefined,
  null,
  { applied: true },
  { applied: true, pairedNewTab: { ...state, materialized: false } },
  { applied: true, pairedNewTab: { ...state, target: { ...target, environmentId: 'other' } } },
  { applied: true, pairedNewTab: { ...state, target: { ...target, group: undefined } } }
])('refuses malformed or mismatched server creation %j', async (result) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  expect(output).not.toHaveBeenCalled()
})
it.each([true, false])('projects only public server page fields json=%s', async (json) => {
  const meta = { runtimeId: 'fixture', secret: 'PRIVATE_META' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: meta,
    result: {
      applied: true,
      url: 'PRIVATE_URL',
      pairedNewTab: { ...state, placement: 'PRIVATE_CLIENT' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run(json)
  expect(output.mock.lastCall?.[0]).toContain('"materialized": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})

it('refuses false confirmation before the existing viewer transport', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run(true, false)).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
