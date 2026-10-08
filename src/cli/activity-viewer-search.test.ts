import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'

const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => call.mockReset())

it('routes local query and sidebar search visibility to the explicit surface', async () => {
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'host' },
    result: {
      viewer: 'host',
      viewerId: 7,
      surface: 'sidebar-agents',
      dispatched: true,
      applied: true,
      persisted: null,
      writeOutcome: 'not_requested',
      groupBy: 'none',
      readFilter: 'all',
      compact: false,
      showChildAgents: true,
      rendered: null
    }
  })
  for (const args of [
    ['search', '--query', 'Activity task a'],
    ['search', '--query', ''],
    ['search-visible', '--enabled', 'true']
  ]) {
    const parsed = parseArgs(
      ['ui', 'activity', ...args, '--viewer', 'host', '--surface', 'sidebar-agents', '--json'],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith(
      'ui.activityViewer',
      expect.objectContaining({
        viewer: 'host',
        surface: 'sidebar-agents',
        operation: args[0]
      })
    )
  }
})

it('fails loudly on an older Activity operation without retrying another surface', async () => {
  const rejected = new RuntimeClientError('invalid_argument', 'unknown operation')
  call.mockRejectedValueOnce(rejected)
  await expect(
    dispatch(['ui', 'activity', 'search'], {
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['surface', 'sidebar-agents'],
        ['query', 'task']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toBe(rejected)
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.activityViewer', {
    viewer: 'host',
    surface: 'sidebar-agents',
    operation: 'search',
    query: 'task'
  })
})
it('rejects sidebar-only visibility on the Activity page before RPC', async () => {
  await expect(
    dispatch(['ui', 'activity', 'search-visible'], {
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['surface', 'activity-page'],
        ['enabled', 'true']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('supported Activity')
  expect(call).not.toHaveBeenCalled()
})

it('parses page clear without an enabled flag and rejects a sidebar clear before RPC', async () => {
  const parsed = parseArgs(
    ['ui', 'activity', 'search-clear', '--viewer', 'host', '--surface', 'activity-page'],
    COMMAND_SPECS.map((spec) => spec.path),
    COMMAND_SPECS
  )
  expect(parsed.commandPath).toEqual(['ui', 'activity', 'search-clear'])
  await expect(
    dispatch(parsed.commandPath, {
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['surface', 'sidebar-agents']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('supported Activity')
  expect(call).not.toHaveBeenCalled()
})
