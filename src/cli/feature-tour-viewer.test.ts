import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { FEATURE_TOUR_COMMAND_SPECS } from './specs/feature-tour-viewer'
import { FEATURE_TOUR_HANDLERS } from './handlers/feature-tour-viewer'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { FeatureTourParams } from '../shared/rpc-contract/feature-tour-params'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
const run = (flags = new Map<string, string | boolean>([['viewer', 'host']])) =>
  FEATURE_TOUR_HANDLERS['ui feature-tour open']({ client, flags, cwd: '/unused', json: true })
afterEach(() => {
  call.mockReset()
  output.mockClear()
})
it('parses an explicit viewer and preserves host metadata and rendered ACK', async () => {
  const parsed = parseArgs(
    ['ui', 'feature-tour', 'open', '--viewer', 'host', '--json'],
    FEATURE_TOUR_COMMAND_SPECS.map((spec) => spec.path),
    FEATURE_TOUR_COMMAND_SPECS
  )
  expect(parsed.commandPath).toEqual(['ui', 'feature-tour', 'open'])
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
      workflowId: 'workbench'
    }
  })
  await run(parsed.flags)
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.featureTourViewer', {
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
    FeatureTourParams.safeParse({ viewer: 'host', operation: 'open', modal: 'settings' }).success
  ).toBe(false)
  expect(call).not.toHaveBeenCalled()
})
it('refuses an old runtime without falling back to another viewer', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old'))
  await expect(run()).rejects.toThrow('Update the target runtime')
  expect(call).toHaveBeenCalledTimes(1)
})
