import { BrowserToolbarExternalState } from '../../shared/rpc-contract/browser-toolbar-external-params'
import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient, RuntimeRpcFailureError } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_TOOLBAR_EXTERNAL_COMMAND_SPECS } from '../specs/browser-toolbar-external'
import { BROWSER_TOOLBAR_EXTERNAL_HANDLERS } from './browser-toolbar-external'
const client = new RuntimeClient(tmpdir())
const command = {
  page: 'page',
  worktreeId: 'folder:fixture',
  workspaceId: 'workspace',
  groupId: 'group',
  executionHostId: 'local',
  url: 'https://fixture.invalid/toolbar'
}
const state = { ...command, requested: true, externalWindowVerified: false }
afterEach(() => vi.restoreAllMocks())
async function run(json = true, url = command.url) {
  const specs = BROWSER_TOOLBAR_EXTERNAL_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'toolbar-external',
      '--viewer',
      'host',
      '--page',
      command.page,
      '--worktree',
      command.worktreeId,
      '--workspace',
      command.workspaceId,
      '--group',
      command.groupId,
      '--execution-host',
      command.executionHostId,
      '--url',
      url
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_TOOLBAR_EXTERNAL_HANDLERS['browser toolbar-external']({
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
  { applied: true, toolbarExternal: { ...state, workspaceId: 'other' } },
  { applied: true, toolbarExternal: { ...state, requested: false } }
])('refuses malformed or mismatched public receipts %j', async (result) => {
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
it.each([true, false])('prints only the checked public projection json=%s', async (json) => {
  const metadata = { runtimeId: 'fixture', secret: 'PRIVATE_META' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: metadata,
    result: {
      applied: true,
      secret: 'PRIVATE_RESULT',
      toolbarExternal: { ...state, secret: 'PRIVATE_OWNER' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run(json)
  expect(output.mock.lastCall?.[0]).toContain('"requested": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
it('refuses an older runtime without falling back to any other operation', async () => {
  const call = vi.spyOn(client, 'call').mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'fixture',
      ok: false,
      _meta: { runtimeId: 'fixture' },
      error: { code: 'invalid_params', message: 'unsupported operation' }
    })
  )
  await expect(run()).rejects.toMatchObject({ code: 'incompatible_runtime' })
  expect(call).toHaveBeenCalledTimes(1)
})

it.each([
  'https://user:PRIVATE_PASSWORD@fixture.invalid/',
  'https://PRIVATE_USER@fixture.invalid/'
])('rejects credential command and matching malformed receipt %s', async (url) => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true, toolbarExternal: { ...state, url } }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(BrowserToolbarExternalState.safeParse({ ...state, url }).success).toBe(false)
  await expect(run(true, url)).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
  expect(output).not.toHaveBeenCalled()
})
