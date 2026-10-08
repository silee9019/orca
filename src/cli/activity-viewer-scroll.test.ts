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
  'dispatches explicit %s offset and preserves viewport evidence',
  async (surface) => {
    call.mockResolvedValue({
      id: 'scroll',
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
        scrollAction: {
          requestedTop: 2000,
          targetTop: 800,
          scrollTop: 800,
          clientHeight: 200,
          scrollHeight: 1000,
          visibleRowKeys: ['row'],
          future: true
        }
      }
    })
    const parsed = parseArgs(
      ['ui', 'activity', 'scroll', '--top', '2000', '--viewer', 'host', '--surface', surface],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenCalledExactlyOnceWith('ui.activityViewer', {
      viewer: 'host',
      surface,
      operation: 'scroll',
      top: 2000
    })
    expect(JSON.parse(String(printed.mock.calls.at(-1)?.[0])).result.scrollAction).toEqual({
      requestedTop: 2000,
      targetTop: 800,
      scrollTop: 800,
      clientHeight: 200,
      scrollHeight: 1000,
      visibleRowKeys: ['row']
    })
  }
)
it.each(['NaN', 'Infinity', '-1', 'abc'])('rejects %s before RPC', async (top) => {
  const parsed = parseArgs(
    ['ui', 'activity', 'scroll', '--top', top, '--viewer', 'host', '--surface', 'activity-page'],
    COMMAND_SPECS.map((spec) => spec.path),
    COMMAND_SPECS
  )
  await expect(
    dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
