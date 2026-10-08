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
it('preserves an observed workspace outcome without inventing a remote acknowledgement', async () => {
  for (const surface of ['activity-page', 'sidebar-agents']) {
    call.mockResolvedValue({
      id: 'j',
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
        navigationAction: {
          operation: 'jump',
          paneKey: 'tab:leaf',
          workspaceId: 'workspace',
          executionHostId: 'ssh:owner',
          requestAccepted: true,
          reached: 'workspace',
          remoteAck: 'unknown',
          future: true
        }
      }
    })
    const parsed = parseArgs(
      ['ui', 'activity', 'jump', '--pane', 'tab:leaf', '--viewer', 'host', '--surface', surface],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith('ui.activityViewer', {
      viewer: 'host',
      surface,
      operation: 'jump',
      paneKey: 'tab:leaf'
    })
    const result = JSON.parse(String(printed.mock.calls.at(-1)?.[0])).result
    expect(result.navigationAction).toEqual({
      operation: 'jump',
      paneKey: 'tab:leaf',
      workspaceId: 'workspace',
      executionHostId: 'ssh:owner',
      requestAccepted: true,
      reached: 'workspace',
      remoteAck: 'unknown'
    })
    const future = ActivityViewerResultSchema.parse({
      ...result,
      navigationAction: {
        ...result.navigationAction,
        operation: 'future',
        reached: 'future',
        remoteAck: 'future'
      }
    })
    expect(future.navigationAction).toMatchObject({
      operation: 'unknown',
      reached: 'unknown',
      remoteAck: 'unknown'
    })
    const { navigationAction, ...legacy } = result
    expect(navigationAction).toBeTruthy()
    expect(ActivityViewerResultSchema.parse(legacy).navigationAction).toBeUndefined()
  }
})
