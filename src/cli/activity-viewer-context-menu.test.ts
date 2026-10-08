import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { ActivityViewerParams } from '../shared/rpc-contract/activity-viewer-params'
import { RuntimeClient } from './runtime-client'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => call.mockReset())
it.each(['true', 'false'])(
  'sets original context menu %s with explicit host and surface',
  async (enabled) => {
    call.mockResolvedValue({
      id: 'edit',
      ok: true,
      _meta: { runtimeId: 'host' },
      result: {
        viewer: 'host',
        viewerId: 1,
        surface: 'activity-page',
        dispatched: true,
        applied: true,
        persisted: null,
        writeOutcome: 'not_requested',
        groupBy: 'none',
        readFilter: 'all',
        compact: false,
        showChildAgents: true,
        rendered: null,
        contextMenuAction: {
          paneKey: 'thread',
          enabled: enabled === 'true',
          visible: enabled === 'true',
          targetPaneKeys: enabled === 'true' ? ['thread'] : []
        }
      }
    })
    const parsed = parseArgs(
      [
        'ui',
        'activity',
        'context-menu',
        '--pane',
        'thread',
        '--enabled',
        enabled,
        '--viewer',
        'host',
        '--surface',
        'activity-page'
      ],
      COMMAND_SPECS.map((s) => s.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenCalledExactlyOnceWith('ui.activityViewer', {
      viewer: 'host',
      surface: 'activity-page',
      operation: 'context-menu',
      paneKey: 'thread',
      enabled: enabled === 'true'
    })
  }
)

it('keeps context menu requests strict and requires an explicit boolean', () => {
  const command = {
    viewer: 'host',
    surface: 'activity-page',
    operation: 'context-menu',
    paneKey: 'thread',
    enabled: true
  }
  expect(ActivityViewerParams.safeParse(command).success).toBe(true)
  expect(
    ActivityViewerParams.safeParse({ ...command, url: 'https://example.com/context/1' }).success
  ).toBe(false)
  expect(ActivityViewerParams.safeParse({ ...command, enabled: 'true' }).success).toBe(false)
})
