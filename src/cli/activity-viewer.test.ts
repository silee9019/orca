import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { ActivityViewerResultSchema } from '../shared/activity-viewer-command'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
const result = {
  viewer: 'host',
  viewerId: 7,
  surface: 'activity-page',
  dispatched: true,
  applied: true,
  persisted: true,
  writeOutcome: 'accepted',
  groupBy: 'none',
  readFilter: 'all',
  compact: false,
  showChildAgents: true,
  rendered: null
}
afterEach(() => {
  call.mockReset()
  output.mockClear()
})
it('routes all preferences through the parser with an explicit surface', async () => {
  call.mockResolvedValue({ id: 'r', ok: true, _meta: { runtimeId: 'host' }, result })
  for (const args of [
    ['get'],
    ['group', '--by', 'project'],
    ['read', '--filter', 'unread'],
    ['compact', '--enabled', 'true'],
    ['children', '--enabled', 'false']
  ]) {
    const parsed = parseArgs(
      ['ui', 'activity', ...args, '--viewer', 'host', '--surface', 'activity-page', '--json'],
      COMMAND_SPECS.map((s) => s.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith(
      'ui.activityViewer',
      expect.objectContaining({ viewer: 'host', surface: 'activity-page', operation: args[0] })
    )
  }
})
it('rejects wrong surface replies and malformed or missing targeting', async () => {
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'host' },
    result: { ...result, surface: 'sidebar-agents' }
  })
  await expect(
    dispatch(['ui', 'activity', 'get'], {
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['surface', 'activity-page']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('invalid_viewer_response')
  call.mockClear()
  await expect(
    dispatch(['ui', 'activity', 'get'], {
      client,
      flags: new Map([['viewer', 'host']]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  expect(ActivityViewerResultSchema.safeParse({ ...result, surface: 'future' }).success).toBe(false)
  expect(
    ActivityViewerResultSchema.parse({
      ...result,
      writeOutcome: 'future',
      reason: 'future',
      extra: true
    })
  ).toMatchObject({ writeOutcome: 'unknown', reason: 'viewer_not_applied' })
})

it('rejects a committed snapshot from a different known surface', () => {
  expect(
    ActivityViewerResultSchema.safeParse({
      ...result,
      rendered: {
        surface: 'sidebar-agents',
        runtimeContextKey: 'local',
        groupBy: 'none',
        readFilter: 'all',
        compact: false,
        showChildAgents: true,
        querySettled: true,
        densityMeasured: true,
        selectedPaneKey: null,
        logicalRows: [],
        renderedRows: []
      }
    }).success
  ).toBe(false)
})

it('fails closed on an older runtime instead of changing a different viewer', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old'))
  await expect(
    dispatch(['ui', 'activity', 'get'], {
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['surface', 'activity-page']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('Update the target runtime')
  expect(call).toHaveBeenCalledTimes(1)
})
