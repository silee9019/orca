import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_EGRESS_COMMAND_SPECS } from '../specs/browser-egress'
import { BROWSER_EGRESS_HANDLERS } from './browser-egress'
import type { BrowserEgressCommand } from '../../shared/rpc-contract/browser-egress-params'
const client = new RuntimeClient(tmpdir())
const state = {
  page: 'page',
  worktreeId: 'folder:fixture',
  open: false,
  settingsOpened: true
}
afterEach(() => vi.restoreAllMocks())
async function run(action: BrowserEgressCommand['action'], json = true) {
  const specs = BROWSER_EGRESS_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'egress',
      action,
      '--viewer',
      'host',
      '--page',
      'page',
      '--worktree',
      'folder:fixture',
      '--placement',
      'streamed',
      '--runtime-environment',
      'env',
      '--remote-page',
      'remote'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_EGRESS_HANDLERS[`browser egress ${action}`]({
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
  { applied: true, egress: { ...state, page: 'other' } },
  { applied: true, egress: { ...state, settingsOpened: false } }
])('refuses malformed or unaccepted cancellation %j', async (result) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run('settings')).rejects.toMatchObject({ code: 'runtime_error' })
  expect(output).not.toHaveBeenCalled()
})
it.each([true, false])('projects only public egress receipt json=%s', async (json) => {
  const meta = { runtimeId: 'fixture', secret: 'PRIVATE_META' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: meta,
    result: {
      applied: true,
      prompt: 'PRIVATE_PROMPT',
      egress: { ...state, description: 'PRIVATE_HOST' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run('settings', json)
  expect(output.mock.lastCall?.[0]).toContain('"settingsOpened": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
