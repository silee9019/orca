import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient } from './runtime-client'
import { ActivityViewerParams } from '../shared/rpc-contract/activity-viewer-params'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => call.mockReset())
it.each(['activity-page', 'sidebar-agents'])(
  'copies the original issue link on %s with explicit target',
  async (surface) => {
    call.mockResolvedValue({
      id: 'copy',
      ok: true,
      _meta: { runtimeId: 'host' },
      result: {
        viewer: 'host',
        viewerId: 1,
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
        copyAction: {
          paneKey: 'thread',
          kind: 'issue-link',
          writeAcknowledged: true,
          verified: true
        }
      }
    })
    const parsed = parseArgs(
      [
        'ui',
        'activity',
        'preview-copy-issue-link',
        '--pane',
        'thread',
        '--viewer',
        'host',
        '--surface',
        surface
      ],
      COMMAND_SPECS.map((s) => s.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenCalledExactlyOnceWith('ui.activityViewer', {
      viewer: 'host',
      surface,
      operation: 'preview-copy-issue-link',
      paneKey: 'thread'
    })
  }
)
it('accepts only a strict target and never takes a caller-provided issue URL', () => {
  const command = {
    viewer: 'host',
    surface: 'activity-page',
    operation: 'preview-copy-issue-link',
    paneKey: 'thread'
  }
  expect(ActivityViewerParams.safeParse(command).success).toBe(true)
  expect(
    ActivityViewerParams.safeParse({ ...command, url: 'https://example.com/issue' }).success
  ).toBe(false)
  expect(ActivityViewerParams.safeParse({ ...command, paneKey: '' }).success).toBe(false)
  expect(ActivityViewerParams.safeParse({ ...command, viewer: 'other' }).success).toBe(false)
})
