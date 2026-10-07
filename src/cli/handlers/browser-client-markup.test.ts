import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_CLIENT_MARKUP_COMMAND_SPECS } from '../specs/browser-client-markup'
import { BROWSER_CLIENT_MARKUP_HANDLERS } from './browser-client-markup'
const client = new RuntimeClient(join(tmpdir(), 'client-markup-fixture'), 60_000, null, null)
const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
afterEach(() => vi.restoreAllMocks())
async function run(action = 'start', generation = '4') {
  const parsed = parseArgs([
    'browser',
    'client-markup',
    '--viewer',
    'host',
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
    generation,
    '--action',
    action
  ])
  validateCommandAndFlags(BROWSER_CLIENT_MARKUP_COMMAND_SPECS, parsed)
  await BROWSER_CLIENT_MARKUP_HANDLERS['browser client-markup']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('requires an exact client receipt and the requested capture state', async () => {
  const receipt = { ...target, action: 'start', state: 'drawing', hasImage: true, accepted: true }
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true, clientMarkup: receipt }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-markup',
    target,
    action: 'start'
  })
  for (const clientMarkup of [
    undefined,
    { ...receipt, pageHostGeneration: 5 },
    { ...receipt, accepted: false },
    { ...receipt, state: 'idle', hasImage: false },
    { ...receipt, action: 'status' }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: { applied: true, clientMarkup }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
})
it('refuses invalid generation and action before requesting the viewer', async () => {
  const call = vi.spyOn(client, 'call')
  await expect(run('start', '-1')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(run('start', '1.5')).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(run('copy')).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
it('does not accept a cancel receipt that retains a drawing image', async () => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      clientMarkup: {
        ...target,
        action: 'cancel',
        state: 'drawing',
        hasImage: true,
        accepted: true
      }
    }
  })
  await expect(run('cancel')).rejects.toMatchObject({ code: 'runtime_error' })
  call.mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      clientMarkup: { ...target, action: 'cancel', state: 'idle', hasImage: false, accepted: true }
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await run('cancel')
})
it('projects public receipts and salvages future status without printing private additions', async () => {
  const metadata = { runtimeId: 'fixture', privateToken: 'private-meta' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: metadata,
    result: {
      applied: true,
      privateToken: 'private-result',
      clientMarkup: {
        ...target,
        action: 'status',
        state: 'future-state',
        hasImage: false,
        accepted: true,
        privateToken: 'private-receipt'
      }
    }
  })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run('status')
  const printed = JSON.parse(String(log.mock.calls[0]?.[0]))
  expect(printed).toEqual({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      page: target.page,
      clientMarkup: {
        ...target,
        action: 'status',
        state: 'unknown',
        hasImage: false,
        accepted: true
      }
    }
  })
  expect(JSON.stringify(printed)).not.toContain('private-')
})
it('refuses malformed status and future cancel state without printing a success', async () => {
  const call = vi.spyOn(client, 'call')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  for (const receipt of [
    { ...target, action: 'status', state: 'idle', hasImage: 'false', accepted: true },
    { ...target, action: 'cancel', state: 'future-state', hasImage: false, accepted: true }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: { applied: true, clientMarkup: receipt }
    })
    await expect(run(receipt.action)).rejects.toMatchObject({ code: 'runtime_error' })
  }
  expect(log).not.toHaveBeenCalled()
})

it('refuses missing result envelopes without printing success', async () => {
  const call = vi.spyOn(client, 'call')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  for (const result of [undefined, null, {}]) {
    call.mockResolvedValue({ id: 'fixture', ok: true, _meta: { runtimeId: 'fixture' }, result })
    await expect(run('status')).rejects.toMatchObject({ code: 'runtime_error' })
  }
  expect(log).not.toHaveBeenCalled()
})
