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
  'copies the original title through explicit %s without printing its value',
  async (surface) => {
    call.mockResolvedValue({
      id: 'copy',
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
        copyAction: {
          paneKey: 'thread',
          kind: 'title',
          writeAcknowledged: true,
          verified: true,
          future: true
        }
      }
    })
    const parsed = parseArgs(
      [
        'ui',
        'activity',
        'copy',
        '--pane',
        'thread',
        '--kind',
        'title',
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
      operation: 'copy',
      paneKey: 'thread',
      kind: 'title'
    })
    expect(JSON.parse(String(printed.mock.calls.at(-1)?.[0])).result.copyAction).toEqual({
      paneKey: 'thread',
      kind: 'title',
      writeAcknowledged: true,
      verified: true
    })
  }
)
it.each(['issue', 'text', ''])('rejects unsupported copy kind %s before RPC', async (kind) => {
  const parsed = parseArgs(
    [
      'ui',
      'activity',
      'copy',
      '--pane',
      'thread',
      '--kind',
      kind,
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

it.each(['activity-page', 'sidebar-agents'])(
  'routes preview path copy on %s without a caller path',
  async (surface) => {
    call.mockResolvedValue({
      id: 'preview-copy',
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
        copyAction: { paneKey: 'thread', kind: 'path', writeAcknowledged: true, verified: true }
      }
    })
    const parsed = parseArgs(
      [
        'ui',
        'activity',
        'preview-copy-path',
        '--pane',
        'thread',
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
      operation: 'preview-copy-path',
      paneKey: 'thread'
    })
  }
)
