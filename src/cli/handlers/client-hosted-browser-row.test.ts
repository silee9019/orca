import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { CLIENT_HOSTED_BROWSER_ROW_COMMAND_SPECS } from '../specs/client-hosted-browser-row'
import { CLIENT_HOSTED_BROWSER_ROW_HANDLERS } from './client-hosted-browser-row'
const client = new RuntimeClient(tmpdir())
afterEach(() => vi.restoreAllMocks())
async function run(json: boolean) {
  const specs = CLIENT_HOSTED_BROWSER_ROW_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'hosted-row',
      'activate',
      '--viewer',
      'host',
      '--page',
      'page',
      '--worktree',
      'folder:fixture',
      '--group',
      'group',
      '--host-client',
      'fixture-client',
      '--confirm'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await CLIENT_HOSTED_BROWSER_ROW_HANDLERS['browser hosted-row activate']({
    ...parsed,
    client,
    cwd: tmpdir(),
    json
  })
}
const receipt = {
  action: 'activate',
  page: 'page',
  worktreeId: 'folder:fixture',
  groupId: 'group',
  expectedHostClientId: 'fixture-client',
  applied: true
}
it.each([
  undefined,
  null,
  {},
  { applied: true, page: 'page', clientHostedRow: null },
  { applied: true, page: 'other', clientHostedRow: receipt }
])('refuses malformed results with explicit runtime_error %j', async (result) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run(true)).rejects.toMatchObject({ code: 'runtime_error' })
  expect(output).not.toHaveBeenCalled()
})
it.each([false, true])(
  'strips private result, receipt and envelope fields json=%s',
  async (json) => {
    const meta = { runtimeId: 'fixture', privateToken: 'META_PRIVATE' }
    vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: meta,
      result: {
        applied: true,
        page: 'page',
        privateToken: 'RESULT_PRIVATE',
        clientHostedRow: { ...receipt, privateToken: 'RECEIPT_PRIVATE' }
      }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await run(json)
    expect(output.mock.lastCall?.[0]).toContain('"applied": true')
    expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
  }
)
