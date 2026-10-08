import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_SERVER_REOPEN_COMMAND_SPECS } from '../specs/browser-server-reopen'
import { BROWSER_SERVER_REOPEN_HANDLERS } from './browser-server-reopen'
const client = new RuntimeClient(tmpdir())
const state = {
  page: 'page',
  worktreeId: 'folder:fixture',
  workspaceId: 'workspace',
  groupId: 'group',
  executionHostId: 'local',
  environmentId: 'env',
  created: true,
  createdRemotePageId: 'new-page'
}
afterEach(() => vi.restoreAllMocks())
async function run(json = true) {
  const specs = BROWSER_SERVER_REOPEN_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'reopen-server',
      '--viewer',
      'host',
      '--page',
      'page',
      '--worktree',
      'folder:fixture',
      '--workspace',
      'workspace',
      '--group',
      'group',
      '--execution-host',
      'local',
      '--runtime-environment',
      'env',
      '--remote-page',
      'source',
      '--browser-host-client',
      'client',
      '--browser-host-generation',
      '3',
      '--page-host-generation',
      '7'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_SERVER_REOPEN_HANDLERS['browser reopen-server']({
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
  { applied: true, serverReopen: { ...state, created: false } },
  { applied: true, serverReopen: { ...state, environmentId: 'other' } },
  { applied: true, serverReopen: { ...state, createdRemotePageId: 'source' } }
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
      serverReopen: { ...state, placement: 'PRIVATE_CLIENT' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run(json)
  expect(output.mock.lastCall?.[0]).toContain('"created": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
