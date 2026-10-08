import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient } from './runtime-client'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => call.mockReset())
it.each(['issue', 'comment'])(
  'opens the original preview %s editor with explicit host and surface',
  async (field) => {
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
        editAction: { paneKey: 'thread', field, opened: true, focus: 'focused' }
      }
    })
    const parsed = parseArgs(
      [
        'ui',
        'activity',
        'preview-edit',
        '--pane',
        'thread',
        '--field',
        field,
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
      operation: 'preview-edit',
      paneKey: 'thread',
      field
    })
  }
)

it.each(['displayName', 'pr'])('rejects non-owned edit field %s before RPC', async (field) => {
  const parsed = parseArgs(
    [
      'ui',
      'activity',
      'preview-edit',
      '--pane',
      'thread',
      '--field',
      field,
      '--viewer',
      'host',
      '--surface',
      'activity-page'
    ],
    COMMAND_SPECS.map((s) => s.path),
    COMMAND_SPECS
  )
  await expect(
    dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
