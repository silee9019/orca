import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient, RuntimeRpcFailureError } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_TITLEBAR_PAIRED_ACTIVATION_COMMAND_SPECS } from '../specs/browser-titlebar-paired-activation'
import { BROWSER_TITLEBAR_PAIRED_ACTIVATION_HANDLERS } from './browser-titlebar-paired-activation'
const client = new RuntimeClient(tmpdir())
const target = {
  worktree: 'folder:fixture',
  group: 'group',
  workspace: 'workspace',
  unifiedTab: 'tab',
  page: 'page',
  remotePageId: 'remote',
  hostTabId: 'host',
  environmentId: 'env',
  executionHostId: 'runtime:env',
  pairingRevision: 7,
  placement: { kind: 'server' }
}
const state = {
  target,
  hostAcknowledged: true,
  callerNavigation: true,
  activeGroup: 'group',
  activeWorkspace: 'workspace',
  activeTab: 'tab',
  activeType: 'browser',
  nativeWindowVerified: false
}
afterEach(() => vi.restoreAllMocks())
async function run() {
  const specs = BROWSER_TITLEBAR_PAIRED_ACTIVATION_COMMAND_SPECS
  const flags = [
    '--viewer',
    'host',
    '--worktree',
    'folder:fixture',
    '--group',
    'group',
    '--workspace',
    'workspace',
    '--unified-tab',
    'tab',
    '--page',
    'page',
    '--remote-page',
    'remote',
    '--host-tab',
    'host',
    '--runtime-environment',
    'env',
    '--execution-host',
    'runtime:env',
    '--pairing-revision',
    '7',
    '--placement',
    'server'
  ]
  const parsed = parseArgs(
    ['browser', 'titlebar-activate-paired', ...flags],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_TITLEBAR_PAIRED_ACTIVATION_HANDLERS['browser titlebar-activate-paired']({
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
  { applied: true },
  { applied: true, titlebarPairedActivation: { ...state, hostAcknowledged: false } },
  { applied: true, titlebarPairedActivation: { ...state, activeTab: 'other' } }
])('rejects malformed or unacknowledged result %#', async (result) => {
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
it('prints only the exact public acknowledged selection', async () => {
  const metadata = { runtimeId: 'fixture', private: 'PRIVATE' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: metadata,
    result: {
      applied: true,
      private: 'PRIVATE',
      titlebarPairedActivation: { ...state, private: 'PRIVATE' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(output.mock.lastCall?.[0]).toContain('"hostAcknowledged": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
it('fails closed for an old peer with no fallback', async () => {
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
