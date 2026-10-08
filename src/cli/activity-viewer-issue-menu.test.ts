import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient } from './runtime-client'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => call.mockReset())
it.each(['true', 'false'])(
  'sets original preview issue menu %s with explicit host and surface',
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
        issueMenuAction: {
          paneKey: 'thread',
          enabled: enabled === 'true',
          visible: enabled === 'true'
        }
      }
    })
    const parsed = parseArgs(
      [
        'ui',
        'activity',
        'preview-issue-menu',
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
      operation: 'preview-issue-menu',
      paneKey: 'thread',
      enabled: enabled === 'true'
    })
  }
)
