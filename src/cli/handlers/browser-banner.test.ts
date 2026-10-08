import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_BANNER_COMMAND_SPECS } from '../specs/browser-banner'
import { BROWSER_BANNER_HANDLERS } from './browser-banner'
import type { BrowserBannerCommand } from '../../shared/rpc-contract/browser-banner-params'
const client = new RuntimeClient(tmpdir())
const state = {
  page: 'page',
  worktreeId: 'folder:fixture',
  hasResourceNotice: false,
  hasPendingAnnotation: false,
  grabState: 'idle',
  sendMenuOpen: false,
  cancellationAccepted: true
}
afterEach(() => vi.restoreAllMocks())
async function run(action: BrowserBannerCommand['action'], json = true) {
  const specs = BROWSER_BANNER_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'banner',
      action,
      '--viewer',
      'host',
      '--page',
      'page',
      '--worktree',
      'folder:fixture'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_BANNER_HANDLERS[`browser banner ${action}`]({
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
  { applied: true, banner: { ...state, page: 'other' } },
  { applied: true, banner: { ...state, cancellationAccepted: undefined } }
])('refuses malformed or unaccepted cancellation %j', async (result) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run('cancel-grab')).rejects.toMatchObject({ code: 'runtime_error' })
  expect(output).not.toHaveBeenCalled()
})
it.each([true, false])('projects only public banner receipt json=%s', async (json) => {
  const meta = { runtimeId: 'fixture', secret: 'PRIVATE_META' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: meta,
    result: {
      applied: true,
      prompt: 'PRIVATE_PROMPT',
      banner: { ...state, payload: 'PRIVATE_PAYLOAD', resourceNotice: 'PRIVATE_NOTICE' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run('cancel-grab', json)
  expect(output.mock.lastCall?.[0]).toContain('"cancellationAccepted": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
