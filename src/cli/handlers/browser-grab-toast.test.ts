import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_GRAB_TOAST_COMMAND_SPECS } from '../specs/browser-grab-toast'
import { BROWSER_GRAB_TOAST_HANDLERS } from './browser-grab-toast'
const client = new RuntimeClient(tmpdir())
const state = {
  page: 'page',
  worktreeId: 'folder:fixture',
  workspaceId: 'workspace',
  groupId: 'group',
  executionHostId: 'local',
  toastId: 'capture',
  hasScreenshot: true,
  copied: true
}
afterEach(() => vi.restoreAllMocks())
async function run(json = true) {
  const specs = BROWSER_GRAB_TOAST_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'grab-toast',
      'copy',
      '--viewer',
      'host',
      '--page',
      'page',
      '--worktree',
      'folder:fixture',
      '--workspace',
      'workspace',
      '--group',
      'group',
      '--execution-host',
      'local',
      '--toast',
      'capture'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_GRAB_TOAST_HANDLERS['browser grab-toast copy']({
    ...parsed,
    client,
    cwd: tmpdir(),
    json
  })
}
it.each([
  undefined,
  null,
  { applied: true },
  { applied: true, grabToast: { ...state, toastId: 'other' } },
  { applied: true, grabToast: { ...state, copied: false } }
])('rejects malformed or mismatched receipt %j', async (result) => {
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
it.each([true, false])('strips image/private fields json=%s', async (json) => {
  const meta = { runtimeId: 'fixture', secret: 'PRIVATE_META' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: meta,
    result: {
      applied: true,
      payload: 'PRIVATE_PAYLOAD',
      grabToast: { ...state, dataUrl: 'PRIVATE_IMAGE' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run(json)
  expect(output.mock.lastCall?.[0]).toContain('"copied": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
