import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_MARKUP_HINT_COMMAND_SPECS } from '../specs/browser-markup-hint'
import { runBrowserMarkupHint } from './browser-markup-hint'
const client = new RuntimeClient(join(tmpdir(), 'markup-hint-fixture'), 60_000, null, null)
const state = {
  page: 'page',
  action: 'dismiss',
  hintOpen: false,
  active: false,
  disabled: false,
  accepted: true
}
afterEach(() => vi.restoreAllMocks())
async function run(action = 'dismiss') {
  const parsed = parseArgs([
    'browser',
    'markup-hint',
    '--viewer',
    'host',
    '--page',
    'page',
    '--action',
    action
  ])
  validateCommandAndFlags(BROWSER_MARKUP_HINT_COMMAND_SPECS, parsed)
  await runBrowserMarkupHint({ flags: parsed.flags, client, cwd: tmpdir(), json: true })
}
it('requires the exact action receipt and projects only the public hint state', async () => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      markupHint: { ...state, privateField: 'private' },
      privateField: 'private'
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'markup-hint',
    page: 'page',
    action: 'dismiss'
  })
  expect(output.mock.calls.flat().join('')).not.toContain('private')
  for (const markupHint of [
    undefined,
    { ...state, page: 'other' },
    { ...state, action: 'toggle' },
    { ...state, accepted: false },
    { ...state, hintOpen: true },
    { ...state, active: 'future' }
  ]) {
    call.mockResolvedValueOnce({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: { applied: true, markupHint }
    })
    await expect(run()).rejects.toThrow('did not acknowledge')
  }
})
it('refuses malformed actions before RPC and disabled toggle acknowledgments', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run('future')).rejects.toThrow('valid markup hint action')
  expect(call).not.toHaveBeenCalled()
  call.mockResolvedValueOnce({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true, markupHint: { ...state, action: 'toggle', disabled: true } }
  })
  await expect(run('toggle')).rejects.toThrow('did not acknowledge')
})
