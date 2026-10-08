import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient } from './runtime-client'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const printed = vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => {
  call.mockReset()
  printed.mockClear()
})
it('routes the original completed parent for each explicit surface and preserves its actual result', async () => {
  for (const surface of ['activity-page', 'sidebar-agents']) {
    call.mockResolvedValue({
      id: 'c',
      ok: true,
      _meta: { runtimeId: 'host' },
      result: {
        viewer: 'host',
        viewerId: 7,
        surface,
        dispatched: true,
        applied: true,
        persisted: null,
        writeOutcome: 'not_requested',
        groupBy: 'none',
        readFilter: 'all',
        compact: false,
        showChildAgents: true,
        rendered: null,
        completedAction: { paneKeys: ['tab:a'], remainingPaneKeys: [], future: true }
      }
    })
    const parsed = parseArgs(
      ['ui', 'activity', 'clear-completed', '--viewer', 'host', '--surface', surface],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith('ui.activityViewer', {
      viewer: 'host',
      surface,
      operation: 'clear-completed'
    })
    expect(JSON.parse(String(printed.mock.calls.at(-1)?.[0])).result.completedAction).toEqual({
      paneKeys: ['tab:a'],
      remainingPaneKeys: []
    })
  }
})

it('routes exact single and JSON bulk targets through the same Activity RPC', async () => {
  for (const surface of ['activity-page', 'sidebar-agents']) {
    call.mockResolvedValue({
      id: 'c',
      ok: true,
      _meta: { runtimeId: 'host' },
      result: {
        viewer: 'host',
        viewerId: 7,
        surface,
        dispatched: true,
        applied: true,
        persisted: null,
        writeOutcome: 'not_requested',
        groupBy: 'none',
        readFilter: 'all',
        compact: false,
        showChildAgents: true,
        rendered: null,
        completedAction: { paneKeys: ['tab:a'], remainingPaneKeys: [] }
      }
    })
    for (const args of [
      ['clear-thread', '--pane', 'tab:a'],
      ['clear-threads', '--panes', '["tab:a","tab:b"]']
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
      expect(call).toHaveBeenLastCalledWith('ui.activityViewer', {
        viewer: 'host',
        surface,
        operation: args[0],
        ...(args[0] === 'clear-thread' ? { paneKey: 'tab:a' } : { paneKeys: ['tab:a', 'tab:b'] })
      })
    }
  }
})
