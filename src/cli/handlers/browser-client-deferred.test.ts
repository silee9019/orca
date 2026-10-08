import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_DEFERRED_COMMAND_SPECS } from '../specs/browser-client-deferred'
import { BROWSER_CLIENT_DEFERRED_HANDLERS } from './browser-client-deferred'
const client = new RuntimeClient(join(tmpdir(), 'client-deferred-fixture'), 60_000, null, null)
const target = {
  worktreeId: 'folder',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote'
}
const receipt = {
  target,
  queued: true,
  completionObserved: false,
  hostPlacementKnown: false,
  url: 'https://after.test/',
  queuedUntil: Date.now() + 60000
}

afterEach(() => vi.restoreAllMocks())
async function run(viewer = 'host', value = 'https://after.test/') {
  const parsed = parseArgs([
    'browser',
    'client-defer',
    '--viewer',
    viewer,
    '--worktree',
    'folder',
    '--page',
    'page',
    '--runtime-environment',
    'paired',
    '--remote-page',
    'remote',
    '--value',
    value
  ])
  validateCommandAndFlags(BROWSER_CLIENT_DEFERRED_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_DEFERRED_HANDLERS['browser client-defer']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('dispatches exact identity and prints only the validated public deferred queue receipt', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientDeferred: { ...receipt, private: 'secret' },
      private: 'secret'
    }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-deferred',
    entry: 'address-bar-staged',
    target,
    value: 'https://after.test/'
  })
  const printed = output.mock.calls.flat().join('')
  expect(printed).toContain('clientDeferred')
  expect(printed).not.toContain('secret')
})
it('rejects old-peer missing, stale, unknown and malformed deferred acknowledgments', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call')
  for (const clientDeferred of [
    undefined,
    { ...receipt, target: { ...target, remotePageId: 'stale' } },
    { ...receipt, queued: false },
    { ...receipt, completionObserved: true },
    { ...receipt, hostPlacementKnown: true },
    { ...receipt, queuedUntil: 0 },
    { ...receipt, url: '' }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, clientDeferred }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
})
it('refuses invalid viewers and empty or excessive inputs before dispatch', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run('remote')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(run('host', '   ')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(run('host', 'x'.repeat(8193))).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})

for (const url of [
  'https://user:password@example.test/',
  'file:///private/fixture',
  'javascript:alert(1)'
]) {
  it('refuses unsafe URL receipt values from a peer before public output', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, clientDeferred: { ...receipt, url } }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
    expect(output).not.toHaveBeenCalled()
  })
}
it('redacts a Kagi token supplied by the peer receipt reader', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      clientDeferred: { ...receipt, url: 'https://kagi.com/search?token=private-token&q=orca' }
    }
  })
  await run()
  const printed = output.mock.calls.flat().join('')
  expect(printed).toContain('https://kagi.com/search?q=orca')
  expect(printed).not.toContain('private-token')
})
it('refuses a peer receipt whose deferred queue lifetime has already expired', async () => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: { applied: true, clientDeferred: { ...receipt, queuedUntil: Date.now() - 1 } }
  })
  await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
})
