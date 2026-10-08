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
it.each(['activity-page', 'sidebar-agents'])(
  'opens the original preview through explicit %s',
  async (surface) => {
    call.mockResolvedValue({
      id: 'preview',
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
        previewAction: {
          paneKey: 'thread',
          enabled: true,
          visible: true,
          future: true
        }
      }
    })
    const parsed = parseArgs(
      [
        'ui',
        'activity',
        'preview',
        '--pane',
        'thread',
        '--enabled',
        'true',
        '--viewer',
        'host',
        '--surface',
        surface
      ],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenCalledExactlyOnceWith('ui.activityViewer', {
      viewer: 'host',
      surface,
      operation: 'preview',
      paneKey: 'thread',
      enabled: true
    })
    expect(JSON.parse(String(printed.mock.calls.at(-1)?.[0])).result.previewAction).toEqual({
      paneKey: 'thread',
      enabled: true,
      visible: true
    })
  }
)
it.each(['yes', '0', 'maybe'])('rejects unsupported enabled %s before RPC', async (enabled) => {
  const parsed = parseArgs(
    [
      'ui',
      'activity',
      'preview',
      '--pane',
      'thread',
      '--enabled',
      enabled,
      '--viewer',
      'host',
      '--surface',
      'activity-page'
    ],
    COMMAND_SPECS.map((spec) => spec.path),
    COMMAND_SPECS
  )
  await expect(
    dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
