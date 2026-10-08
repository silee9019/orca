import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_VIEWPORT_PAN_COMMAND_SPECS } from '../specs/browser-viewport-pan'
import { runBrowserViewportPan } from './browser-viewport-pan'
const client = new RuntimeClient(join(tmpdir(), 'viewport-pan-fixture'), 60000, null, null)
const position = { scrollLeft: 0, scrollTop: 0, maxScrollLeft: 600, maxScrollTop: 600 }
const receipt = {
  page: 'page',
  delta: { deltaX: 40, deltaY: 80 },
  before: position,
  after: { ...position, scrollLeft: 40, scrollTop: 80 },
  accepted: true
}
afterEach(() => vi.restoreAllMocks())
async function run(deltaX = '40', viewer = 'host') {
  const parsed = parseArgs([
    'browser',
    'viewport-pan',
    '--viewer',
    viewer,
    '--page',
    'page',
    '--delta-x',
    deltaX,
    '--delta-y',
    '80'
  ])
  validateCommandAndFlags(BROWSER_VIEWPORT_PAN_COMMAND_SPECS, parsed)
  await runBrowserViewportPan({ flags: parsed.flags, client, cwd: tmpdir(), json: true })
}
it('sends exact panel deltas and projects only the public DOM readback', async () => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      viewportPan: { ...receipt, privateField: 'private' },
      privateField: 'private'
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'viewport-pan',
    page: 'page',
    delta: receipt.delta
  })
  expect(output.mock.calls.flat().join('')).not.toContain('private')
  for (const viewportPan of [
    undefined,
    { ...receipt, page: 'other' },
    { ...receipt, delta: { deltaX: 0, deltaY: 80 } },
    { ...receipt, accepted: false },
    { ...receipt, after: { ...position, scrollTop: 'future' } }
  ]) {
    call.mockResolvedValueOnce({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: { applied: true, viewportPan }
    })
    await expect(run()).rejects.toThrow('did not acknowledge')
  }
})
it('refuses malformed and excessive deltas or another viewer before RPC', async () => {
  const call = vi.spyOn(client, 'call')
  for (const value of ['NaN', 'Infinity', '100001']) {
    await expect(run(value)).rejects.toThrow('finite panel deltas')
  }
  await expect(run('40', 'client')).rejects.toThrow('finite panel deltas')
  expect(call).not.toHaveBeenCalled()
})
