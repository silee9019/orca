import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { StatusBarViewerResultSchema } from '../shared/status-bar-viewer-command'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => {
  call.mockReset()
  output.mockClear()
})
const result = {
  viewer: 'host',
  viewerId: 7,
  dispatched: true,
  applied: true,
  persisted: true,
  visible: true,
  items: ['ports'],
  availableItems: ['ports'],
  percentageDisplay: 'remaining',
  percentageNoticeDismissed: true,
  interactionRecorded: false,
  writes: { preference: 'accepted', interaction: 'not_requested' },
  rendered: null
}
it('routes explicit status bar commands and validates the host reply', async () => {
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target' },
    result: { ...result, future: true }
  })
  for (const args of [
    ['get'],
    ['toggle'],
    ['item', '--item', 'ports', '--enabled', 'false'],
    ['percentage', '--display', 'remaining']
  ]) {
    const parsed = parseArgs(
      ['ui', 'status-bar', ...args, '--viewer', 'host', '--json'],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith(
      'ui.statusBarViewer',
      expect.objectContaining({ viewer: 'host', operation: args[0] })
    )
    expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({
      result: { viewerId: 7, applied: true }
    })
  }
  expect(call.mock.calls[2]?.[1]).toMatchObject({ enabled: false })
})
it('rejects ambiguous booleans and missing viewer before mutation', async () => {
  for (const flags of [
    new Map([
      ['item', 'ports'],
      ['enabled', 'true']
    ]),
    new Map([
      ['viewer', 'host'],
      ['item', 'ports'],
      ['enabled', 'yes']
    ])
  ]) {
    await expect(
      dispatch(['ui', 'status-bar', 'item'], { client, flags, cwd: '/unused', json: true })
    ).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})
it('refuses an old runtime without switching to a peer', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old'))
  await expect(
    dispatch(['ui', 'status-bar', 'get'], {
      client,
      flags: new Map([['viewer', 'host']]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('Update the target runtime')
})
it('salvages future reply fields and reasons but rejects invalid required fields', () => {
  expect(
    StatusBarViewerResultSchema.parse({ ...result, future: true, reason: 'future_reason' })
  ).toMatchObject({ reason: 'viewer_not_applied' })
  expect(StatusBarViewerResultSchema.safeParse({ ...result, viewerId: '7' }).success).toBe(false)
})
