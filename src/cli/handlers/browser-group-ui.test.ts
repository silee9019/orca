import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_GROUP_UI_COMMAND_SPECS } from '../specs/browser-group-ui'
import { BROWSER_GROUP_UI_HANDLERS } from './browser-group-ui'
const client = new RuntimeClient(join(tmpdir(), 'browser-group-ui-fixture'), 60_000, null, null)
const flags = ['--viewer', 'host', '--worktree', 'folder', '--group', 'group']
async function run(args: string[]) {
  const parsed = parseArgs(['browser', 'group-ui', ...args])
  validateCommandAndFlags(BROWSER_GROUP_UI_COMMAND_SPECS, parsed)
  await BROWSER_GROUP_UI_HANDLERS['browser group-ui']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
afterEach(() => vi.restoreAllMocks())
it.each(['new-browser', 'status'])('sends exact invoking group for %s', async (action) => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true, rendered: false, persisted: false }
  })
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await run([...flags, '--action', action])
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'group-ui',
    target: { worktree: 'folder', group: 'group' },
    action
  })
})
it('refuses invalid action/viewer and missing exact group before RPC', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run([...flags, '--action', 'unsafe'])).rejects.toThrow(
    'Invalid browser viewer command'
  )
  await expect(run([...flags, '--action', 'new-browser', '--viewer', 'ssh'])).rejects.toThrow(
    'Invalid browser viewer command'
  )
  await expect(
    run(['--viewer', 'host', '--worktree', 'folder', '--action', 'new-browser'])
  ).rejects.toThrow('--group')
  expect(call).not.toHaveBeenCalled()
})
it('does not treat unapplied owner response as successful creation', async () => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: false, rendered: false, persisted: false }
  })
  await expect(run([...flags, '--action', 'new-browser'])).rejects.toThrow('did not apply')
})
