import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_TAB_UI_COMMAND_SPECS } from '../specs/browser-tab-ui'
import { BROWSER_TAB_UI_HANDLERS } from './browser-tab-ui'
const client = new RuntimeClient(join(tmpdir(), 'browser-tab-ui-fixture'), 60_000, null, null)
const target = { workspace: 'workspace', worktree: 'folder', group: 'group', unifiedTab: 'unified' }
const flags = [
  '--viewer',
  'host',
  '--workspace',
  target.workspace,
  '--worktree',
  target.worktree,
  '--group',
  target.group,
  '--unified-tab',
  target.unifiedTab
]
async function run(args: string[]) {
  const parsed = parseArgs(['browser', 'tab-ui', ...args])
  validateCommandAndFlags(BROWSER_TAB_UI_COMMAND_SPECS, parsed)
  await BROWSER_TAB_UI_HANDLERS['browser tab-ui']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
afterEach(() => vi.restoreAllMocks())
it.each([
  'activate',
  'close',
  'close-others',
  'close-left',
  'close-right',
  'toggle-pin',
  'duplicate',
  'status'
])('sends exact workspace/group/unified target for %s', async (action) => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true, rendered: false, persisted: false }
  })
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await run([...flags, '--action', action, ...(action.startsWith('close') ? ['--confirm'] : [])])
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'tab-ui',
    target,
    action
  })
})
it.each(['close', 'close-others', 'close-left', 'close-right'])(
  'requires confirmation for %s before RPC',
  async (action) => {
    const call = vi.spyOn(client, 'call')
    await expect(run([...flags, '--action', action])).rejects.toThrow('--confirm')
    expect(call).not.toHaveBeenCalled()
  }
)
it('rejects invalid viewer, action and missing target before RPC', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run([...flags, '--action', 'unsafe'])).rejects.toThrow(
    'Invalid browser viewer command'
  )
  await expect(run([...flags, '--viewer', 'ssh', '--action', 'status'])).rejects.toThrow(
    'Invalid browser viewer command'
  )
  await expect(run(['--viewer', 'host', '--action', 'status'])).rejects.toThrow('--workspace')
  expect(call).not.toHaveBeenCalled()
})
it('does not turn an unapplied viewer response into success', async () => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: false, rendered: false, persisted: false }
  })
  await expect(run([...flags, '--action', 'activate'])).rejects.toThrow('did not apply')
})

it('sends an explicit bounded menu point and refuses absent or invalid coordinates before RPC', async () => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true }
  })
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await run([...flags, '--action', 'menu-open', '--x', '25', '--y', '30'])
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'tab-ui',
    target,
    action: 'menu-open',
    point: { x: 25, y: 30 }
  })
  call.mockClear()
  await expect(run([...flags, '--action', 'menu-open'])).rejects.toThrow('--x')
  await expect(run([...flags, '--action', 'menu-open', '--x', '-1', '--y', '3'])).rejects.toThrow(
    'Invalid browser viewer command'
  )
  expect(call).not.toHaveBeenCalled()
})
