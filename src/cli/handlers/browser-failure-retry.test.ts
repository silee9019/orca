import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_FAILURE_COMMAND_SPECS } from '../specs/browser-failure'
import { BROWSER_FAILURE_HANDLERS } from './browser-failure'
const client = new RuntimeClient(
  join(tmpdir(), 'browser-failure-retry-fixture'),
  60_000,
  null,
  null
)
const target = {
  worktreeId: 'folder:fixture',
  placement: 'local',
  environmentId: null,
  expectedUrl: 'https://retry.invalid/',
  errorCode: -105,
  action: 'retry'
}
afterEach(() => vi.restoreAllMocks())
async function run(action = 'retry') {
  const parsed = parseArgs([
    'browser',
    'failure',
    '--viewer',
    'host',
    '--page',
    'page',
    '--worktree',
    target.worktreeId,
    '--placement',
    'local',
    '--url',
    target.expectedUrl,
    '--error-code',
    String(target.errorCode),
    '--action',
    action
  ])
  validateCommandAndFlags(BROWSER_FAILURE_COMMAND_SPECS, parsed)
  await BROWSER_FAILURE_HANDLERS['browser failure']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('routes retry to the exact viewer owner and accepts only its matching receipt', async () => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true, page: 'page', failureState: { ...target, accepted: true } }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'load-failure',
    page: 'page',
    command: target
  })
  expect(output).toHaveBeenCalled()
})
it.each([
  undefined,
  { ...target, accepted: true, action: 'copy-address' },
  { ...target, accepted: false }
])('refuses missing or mismatched retry acknowledgment %j', async (failureState) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true, page: 'page', failureState }
  })
  await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
})

it('routes HTTPS recovery with the exact action receipt and rejects a retry receipt', async () => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      page: 'page',
      failureState: { ...target, action: 'try-https', accepted: true }
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await run('try-https')
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'load-failure',
    page: 'page',
    command: { ...target, action: 'try-https' }
  })
  call.mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      page: 'page',
      failureState: { ...target, accepted: true }
    }
  })
  await expect(run('try-https')).rejects.toMatchObject({ code: 'runtime_error' })
})
