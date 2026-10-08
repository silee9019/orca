import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { SETUP_GUIDE_COMMAND_SPECS } from './specs/setup-guide-viewer'
import { SETUP_GUIDE_HANDLERS } from './handlers/setup-guide-viewer'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { SetupGuideParams } from '../shared/rpc-contract/setup-guide-params'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
const run = (flags = new Map<string, string | boolean>([['viewer', 'host']])) =>
  SETUP_GUIDE_HANDLERS['ui setup-guide open']({ client, flags, cwd: '/unused', json: true })
afterEach(() => {
  call.mockReset()
  output.mockClear()
})
it('parses an explicit viewer and preserves host metadata and rendered ACK', async () => {
  const parsed = parseArgs(
    ['ui', 'setup-guide', 'open', '--viewer', 'host', '--json'],
    SETUP_GUIDE_COMMAND_SPECS.map((spec) => spec.path),
    SETUP_GUIDE_COMMAND_SPECS
  )
  expect(parsed.commandPath).toEqual(['ui', 'setup-guide', 'open'])
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target' },
    result: {
      viewer: 'host',
      viewerId: 7,
      applied: true,
      source: 'help_menu',
      dialogPresent: true,
      contentPresent: true,
      stepId: 'default-agent'
    }
  })
  await run(parsed.flags)
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.setupGuideViewer', {
    viewer: 'host',
    operation: 'open'
  })
  expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({
    _meta: { runtimeId: 'target' },
    result: { viewerId: 7, applied: true }
  })
})
it('refuses missing or other viewers and arbitrary modal inputs', async () => {
  for (const flags of [new Map<string, string>(), new Map([['viewer', 'clients']])]) {
    await expect(run(flags)).rejects.toThrow()
  }
  expect(
    SetupGuideParams.safeParse({ viewer: 'host', operation: 'open', modal: 'settings' }).success
  ).toBe(false)
  expect(call).not.toHaveBeenCalled()
})
it('refuses an old runtime without falling back to another viewer', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old'))
  await expect(run()).rejects.toThrow('Update the target runtime')
  expect(call).toHaveBeenCalledTimes(1)
})
