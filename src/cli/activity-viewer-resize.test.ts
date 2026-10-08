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
const parse = (width: string, surface = 'activity-page') =>
  parseArgs(
    ['ui', 'activity', 'resize', '--width', width, '--viewer', 'host', '--surface', surface],
    COMMAND_SPECS.map((spec) => spec.path),
    COMMAND_SPECS
  )
it('dispatches the original requested width and preserves actual clamped width', async () => {
  call.mockResolvedValue({
    id: 'resize',
    ok: true,
    _meta: { runtimeId: 'host' },
    result: {
      viewer: 'host',
      viewerId: 7,
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
      resizeAction: { requestedWidth: 1000, targetWidth: 720, renderedWidth: 720, future: true }
    }
  })
  const parsed = parse('1000')
  await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.activityViewer', {
    viewer: 'host',
    surface: 'activity-page',
    operation: 'resize',
    width: 1000
  })
  expect(JSON.parse(String(printed.mock.calls.at(-1)?.[0])).result.resizeAction).toEqual({
    requestedWidth: 1000,
    targetWidth: 720,
    renderedWidth: 720
  })
})
it.each(['NaN', 'Infinity', '-1', '0', 'abc'])('rejects width %s before RPC', async (width) => {
  const parsed = parse(width)
  await expect(
    dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
it('rejects sidebar resizing before RPC', async () => {
  const parsed = parse('600', 'sidebar-agents')
  await expect(
    dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
