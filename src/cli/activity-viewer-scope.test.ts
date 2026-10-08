import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const printed = vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => call.mockReset())
const result = (surface: string) => ({
  id: 'r',
  ok: true as const,
  _meta: { runtimeId: 'host' },
  result: {
    viewer: 'host',
    viewerId: 7,
    surface,
    dispatched: true,
    applied: true,
    persisted: true,
    writeOutcome: 'accepted',
    groupBy: 'none',
    readFilter: 'all',
    compact: false,
    showChildAgents: true,
    rendered: null,
    persistedScope: {
      visibleHostIds: null,
      filterRepoIds: [],
      hideOtherClients: false,
      hideAutomation: false,
      hideCli: false
    }
  }
})
it('routes existing origin, host and compound reset controls with explicit surfaces', async () => {
  for (const surface of ['activity-page', 'sidebar-agents']) {
    call.mockResolvedValue(result(surface))
    for (const args of [
      ['origin', '--kind', 'cli', '--hidden', 'true'],
      ['origin', '--kind', 'automation', '--hidden', 'false'],
      ['origin', '--kind', 'other-client', '--hidden', 'true'],
      ['scope-reset'],
      ['host-toggle', '--host', 'ssh:fixture'],
      ['hosts-toggle-all']
    ]) {
      const parsed = parseArgs(
        ['ui', 'activity', ...args, '--viewer', 'host', '--surface', surface],
        COMMAND_SPECS.map((spec) => spec.path),
        COMMAND_SPECS
      )
      await dispatch(parsed.commandPath, {
        client,
        flags: parsed.flags,
        cwd: '/unused',
        json: true
      })
      expect(JSON.parse(String(printed.mock.calls.at(-1)?.[0])).result.persistedScope).toEqual(
        result(surface).result.persistedScope
      )
      expect(call).toHaveBeenLastCalledWith(
        'ui.activityViewer',
        expect.objectContaining({ viewer: 'host', surface, operation: args[0] })
      )
    }
  }
})
it('rejects invalid origin flags locally and keeps old-runtime rejection fail-loud', async () => {
  for (const [kind, hidden] of [
    ['unknown', 'true'],
    ['cli', 'yes']
  ]) {
    await expect(
      dispatch(['ui', 'activity', 'origin'], {
        client,
        flags: new Map([
          ['viewer', 'host'],
          ['surface', 'activity-page'],
          ['kind', kind],
          ['hidden', hidden]
        ]),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
  const rejected = new RuntimeClientError('invalid_argument', 'unknown operation')
  call.mockRejectedValueOnce(rejected)
  await expect(
    dispatch(['ui', 'activity', 'scope-reset'], {
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['surface', 'activity-page']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toBe(rejected)
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.activityViewer', {
    viewer: 'host',
    surface: 'activity-page',
    operation: 'scope-reset'
  })
})
