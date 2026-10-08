import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_ADDRESS_COMMAND_SPECS } from '../specs/browser-client-address'
import { BROWSER_CLIENT_ADDRESS_HANDLERS } from './browser-client-address'
const client = new RuntimeClient(join(tmpdir(), 'client-address-fixture'), 60_000, null, null)
const target = {
  worktreeId: 'folder',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const state = { value: 'draft', open: true, focused: true, selectedIndex: -1, suggestions: [] }
afterEach(() => vi.restoreAllMocks())
async function run(action = 'draft') {
  const parsed = parseArgs([
    'browser',
    'client-address',
    '--viewer',
    'host',
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
    '--action',
    action,
    '--text',
    'draft'
  ])
  validateCommandAndFlags(BROWSER_CLIENT_ADDRESS_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_ADDRESS_HANDLERS['browser client-address']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('prints only the validated exact target and address state', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientAddress: {
        target: { ...target, private: 'secret' },
        state: {
          ...state,
          private: 'secret',
          suggestions: [
            { index: 0, url: 'https://test/', title: 'Future', kind: 'future', private: 'secret' }
          ]
        },
        private: 'secret'
      },
      private: 'secret'
    }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-address',
    target,
    command: { action: 'draft', text: 'draft' }
  })
  const printed = output.mock.calls.flat().join('')
  expect(printed).not.toContain('secret')
  expect(printed).toContain('unknown')
})
it('rejects missing, stale, malformed and unconfirmed editing receipts', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call')
  for (const clientAddress of [
    undefined,
    { target: { ...target, pageHostGeneration: 5 }, state },
    { target, state: { ...state, value: 'different' } },
    { target, state: { ...state, focused: 'true' } }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, clientAddress }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
})
it.each(['submit', 'select'])('refuses navigation action %s before dispatch', async (action) => {
  const call = vi.spyOn(client, 'call')
  await expect(run(action)).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
