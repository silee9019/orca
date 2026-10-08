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
const receipt = {
  target,
  cancelled: true,
  dragActive: false,
  hoverVisible: false,
  ownerPassthroughHeld: false,
  ownerMissedEndFallbackInstalled: false,
  passthroughActiveAfter: false,
  activeGroup: 'right',
  activeTabs: { left: null, right: 'tab' },
  nativePointerVerified: false
}
afterEach(() => vi.restoreAllMocks())
async function run(extra: string[] = []) {
  const parsed = parseArgs([
    'browser',
    'tab-drag',
    'cancel',
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
    ...extra
  ])
  validateCommandAndFlags(BROWSER_TAB_DROP_COMMAND_SPECS, parsed)
  await BROWSER_TAB_DROP_HANDLERS['browser tab-drag cancel']({
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
    result: { applied: true, tabDragCancel: { ...receipt, private: 'secret' }, private: 'secret' }
  })
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'tab-drag-cancel',
    target
  })
  expect(output.mock.calls.flat().join('')).not.toContain('secret')
  expect(output.mock.calls.flat().join('')).toContain('nativePointerVerified')
})
it('refuses absent, stale and malformed old-peer receipts', async () => {
  const call = vi.spyOn(client, 'call')
  for (const tabDragCancel of [
    undefined,
    { ...receipt, target: { ...target, workspace: 'stale' } },
    { ...receipt, cancelled: false },
    { ...receipt, nativePointerVerified: true }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'viewer' },
      result: { applied: true, tabDragCancel }
    })
    await expect(run()).rejects.toThrow('not acknowledged')
  }
})
