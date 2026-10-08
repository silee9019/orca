import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_OVERLAY_FOCUS_COMMAND_SPECS } from '../specs/browser-overlay-focus'
import { BROWSER_OVERLAY_FOCUS_HANDLERS } from './browser-overlay-focus'
const client = new RuntimeClient(tmpdir())
const target = {
  worktreeId: 'folder:fixture',
  workspaceId: 'workspace',
  groupId: 'group',
  executionHostId: 'local'
}
afterEach(() => vi.restoreAllMocks())
async function run() {
  const specs = BROWSER_OVERLAY_FOCUS_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'owning-group-focus',
      '--viewer',
      'host',
      '--worktree',
      target.worktreeId,
      '--workspace',
      target.workspaceId,
      '--group',
      target.groupId,
      '--execution-host',
      target.executionHostId
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_OVERLAY_FOCUS_HANDLERS['browser owning-group-focus']({
    ...parsed,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it.each([
  undefined,
  null,
  { applied: true },
  {
    applied: true,
    overlayFocus: { ...target, activeTabId: 'tab', focused: true, groupId: 'other' }
  }
])('refuses missing or mismatched receipt %j', async (result) => {
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
it('prints only exact public receipt fields', async () => {
  const meta = { runtimeId: 'fixture', secret: 'PRIVATE_META' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: meta,
    result: {
      applied: true,
      secret: 'PRIVATE_RESULT',
      overlayFocus: { ...target, activeTabId: 'tab', focused: true, secret: 'PRIVATE_RECEIPT' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(output.mock.lastCall?.[0]).toContain('"focused": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
