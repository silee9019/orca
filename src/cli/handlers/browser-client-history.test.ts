import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient, RuntimeRpcFailureError } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_HISTORY_COMMAND_SPECS } from '../specs/browser-client-history'
import { BROWSER_CLIENT_HISTORY_HANDLERS } from './browser-client-history'
const client = new RuntimeClient(tmpdir())
const target = {
  worktreeId: 'folder:history',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const state = {
  target,
  action: 'back',
  accepted: true,
  completionObserved: false,
  observedUrl: 'https://first.test/',
  loading: false
}
afterEach(() => vi.restoreAllMocks())
async function run() {
  const specs = BROWSER_CLIENT_HISTORY_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'client-history',
      '--viewer',
      'host',
      '--action',
      'back',
      '--worktree',
      target.worktreeId,
      '--page',
      target.page,
      '--runtime-environment',
      target.environmentId,
      '--remote-page',
      target.remotePageId,
      '--browser-client',
      target.browserHostClientId,
      '--browser-host-generation',
      '3',
      '--page-host-generation',
      '4'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_CLIENT_HISTORY_HANDLERS['browser client-history']({
    ...parsed,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it.each([
  undefined,
  null,
  {},
  { applied: true, clientHistory: { ...state, action: 'forward' } },
  { applied: true, clientHistory: { ...state, target: { ...target, pageHostGeneration: 5 } } }
])('rejects malformed/mismatched receipts %j', async (result) => {
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
it('projects only checked public receipt fields', async () => {
  const metadata = { runtimeId: 'fixture', private: 'PRIVATE' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: metadata,
    result: { applied: true, clientHistory: { ...state, private: 'PRIVATE' }, private: 'PRIVATE' }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(output.mock.lastCall?.[0]).toContain('"completionObserved": false')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
it('refuses an old peer without a fallback effect', async () => {
  const call = vi.spyOn(client, 'call').mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'fixture',
      ok: false,
      _meta: { runtimeId: 'fixture' },
      error: { code: 'invalid_params', message: 'unsupported' }
    })
  )
  await expect(run()).rejects.toMatchObject({ code: 'incompatible_runtime' })
  expect(call).toHaveBeenCalledTimes(1)
})

it('redacts an old reader URL token before public output', async () => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      clientHistory: {
        ...state,
        observedUrl: 'https://kagi.com/search?token=PRIVATE_TOKEN&q=history'
      }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE_TOKEN')
  expect(output.mock.lastCall?.[0]).toContain('q=history')
})

it.each(['https://user:PRIVATE_PASSWORD@first.test/', 'https://PRIVATE_USER@first.test/'])(
  'refuses credential reader URL %s',
  async (observedUrl) => {
    vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: { applied: true, clientHistory: { ...state, observedUrl } }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
    expect(output).not.toHaveBeenCalled()
  }
)
it.each(['', 'about:blank', 'data:text/html,', 'file:///fixture/history.html'])(
  'preserves existing safe history URL %s',
  async (observedUrl) => {
    vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: { applied: true, clientHistory: { ...state, observedUrl } }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await run()
    expect(output).toHaveBeenCalled()
  }
)
