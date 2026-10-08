import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_TAB_DROP_COMMAND_SPECS } from '../specs/browser-tab-drop'
import { BROWSER_TAB_DROP_HANDLERS } from './browser-tab-drop'
const client = new RuntimeClient(join(tmpdir(), 'tab-drop-fixture'), 60_000, null, null)
const target = {
  worktree: 'folder',
  workspace: 'browser',
  unifiedTab: 'tab',
  group: 'left',
  environmentId: null
}
const destination = { kind: 'pane', group: 'right' }
const receipt = {
  target,
  destination,
  moved: true,
  group: 'right',
  order: ['tab'],
  activeGroup: 'right',
  activeTabs: { left: null, right: 'tab' },
  hostMoveAcknowledged: false,
  nativePointerVerified: false
}
afterEach(() => vi.restoreAllMocks())
async function run(extra: string[] = []) {
  const parsed = parseArgs([
    'browser',
    'tab-drop',
    '--viewer',
    'host',
    '--worktree',
    'folder',
    '--workspace',
    'browser',
    '--group',
    'left',
    '--unified-tab',
    'tab',
    '--kind',
    'pane',
    '--destination-group',
    'right',
    ...extra
  ])
  validateCommandAndFlags(BROWSER_TAB_DROP_COMMAND_SPECS, parsed)
  await BROWSER_TAB_DROP_HANDLERS['browser tab-drop']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('dispatches the exact resolved drop and prints only its checked receipt', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: { applied: true, tabDrop: { ...receipt, private: 'secret' }, private: 'secret' }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'tab-drop',
    target,
    destination
  })
  expect(output.mock.calls.flat().join('')).not.toContain('secret')
  expect(output.mock.calls.flat().join('')).toContain('nativePointerVerified')
})
it('refuses absent, stale and malformed old-peer receipts', async () => {
  const call = vi.spyOn(client, 'call')
  for (const tabDrop of [
    undefined,
    { ...receipt, target: { ...target, workspace: 'stale' } },
    { ...receipt, destination: { ...destination, group: 'stale' } },
    { ...receipt, moved: false },
    { ...receipt, nativePointerVerified: true }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, tabDrop }
    })
    await expect(run()).rejects.toThrow('not acknowledged')
  }
})
it('requires explicit host acknowledgment for paired movement', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      tabDrop: { ...receipt, target: { ...target, environmentId: 'paired' } }
    }
  })
  await expect(run(['--runtime-environment', 'paired'])).rejects.toThrow('not acknowledged')
  call.mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer' },
    result: {
      applied: true,
      tabDrop: {
        ...receipt,
        target: { ...target, environmentId: 'paired' },
        hostMoveAcknowledged: true
      }
    }
  })
  await run(['--runtime-environment', 'paired'])
})
it('refuses irrelevant destination flags before sending any request', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run(['--side', 'left'])).rejects.toThrow('resolved')
  await expect(run(['--direction', 'down'])).rejects.toThrow('resolved')
  expect(call).not.toHaveBeenCalled()
})
