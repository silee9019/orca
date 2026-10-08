import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient } from './runtime-client'
import { ActivityViewerResultSchema } from '../shared/activity-viewer-command'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const printed = vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => {
  call.mockReset()
  printed.mockClear()
})
it('routes explicit single and JSON multi targets and preserves the public read result', async () => {
  for (const surface of ['activity-page', 'sidebar-agents']) {
    call.mockResolvedValue({
      id: 'r',
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
        readAction: { operation: 'read', paneKeys: ['tab:a'] },
        readStates: [{ paneKey: 'tab:a', unread: false }]
      }
    })
    for (const args of [
      ['read-toggle', '--pane', 'tab:a'],
      ['read-toggle-many', '--panes', '["tab:a","tab:b"]']
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
        ...(args[0] === 'read-toggle' ? { paneKey: 'tab:a' } : { paneKeys: ['tab:a', 'tab:b'] })
      })
      expect(JSON.parse(String(printed.mock.calls.at(-1)?.[0])).result.readStates).toEqual([
        { paneKey: 'tab:a', unread: false }
      ])
    }
  }
})
it('rejects malformed, duplicate or incomplete JSON targets before RPC', async () => {
  for (const value of ['invalid', '[]', '["one"]', '["one","one"]']) {
    await expect(
      dispatch(['ui', 'activity', 'read-toggle-many'], {
        client,
        flags: new Map([
          ['viewer', 'host'],
          ['surface', 'activity-page'],
          ['panes', value]
        ]),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})

it('accepts older replies and salvages future read action values without exposing added fields', () => {
  const reply = {
    viewer: 'host',
    viewerId: 7,
    surface: 'activity-page',
    dispatched: false,
    applied: true,
    persisted: null,
    writeOutcome: 'not_requested',
    groupBy: 'none',
    readFilter: 'all',
    compact: false,
    showChildAgents: true,
    rendered: null
  }
  expect(ActivityViewerResultSchema.parse(reply).readAction).toBeUndefined()
  expect(
    ActivityViewerResultSchema.parse({
      ...reply,
      readAction: { operation: 'future-operation', paneKeys: ['tab:a'], future: true },
      readStates: [{ paneKey: 'tab:a', unread: null, future: true }],
      future: true
    })
  ).toEqual({
    ...reply,
    readAction: { operation: 'unknown', paneKeys: ['tab:a'] },
    readStates: [{ paneKey: 'tab:a', unread: null }]
  })
})
