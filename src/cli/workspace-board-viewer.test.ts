import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { WorkspaceBoardResultSchema } from '../shared/workspace-board-command'

const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
const result = {
  viewer: 'host',
  viewerId: 7,
  dispatched: true,
  applied: true,
  persisted: true,
  writeOutcome: 'unknown',
  reassignment: 'not_requested',
  statuses: [{ id: 'in-progress', label: 'In progress', color: 'blue', icon: 'circle-dot' }],
  columnWidth: 308,
  rendered: null
}
const run = (args: string[]) => {
  const parsed = parseArgs(
    ['ui', 'workspace-board', ...args, '--viewer', 'host', '--json'],
    COMMAND_SPECS.map((s) => s.path),
    COMMAND_SPECS
  )
  return dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
}
afterEach(() => {
  call.mockReset()
  output.mockClear()
})

it('routes each board operation through the public parser with explicit options', async () => {
  call.mockResolvedValue({ id: 'r', ok: true, _meta: { runtimeId: 'host' }, result })
  const cases: [string[], Record<string, unknown>][] = [
    [['get'], { operation: 'get' }],
    [['status-add'], { operation: 'status-add' }],
    [
      ['status-rename', '--status', 'in-review', '--label', 'QA review'],
      { operation: 'status-rename', statusId: 'in-review', label: 'QA review' }
    ],
    [
      ['status-color', '--status', 'in-review', '--color', 'rose'],
      { operation: 'status-color', statusId: 'in-review', color: 'rose' }
    ],
    [
      ['status-icon', '--status', 'in-review', '--icon', 'flag'],
      { operation: 'status-icon', statusId: 'in-review', icon: 'flag' }
    ],
    [
      ['status-move', '--status', 'in-review', '--direction', 'right'],
      { operation: 'status-move', statusId: 'in-review', direction: 'right' }
    ],
    [
      ['status-remove', '--status', 'in-review'],
      { operation: 'status-remove', statusId: 'in-review' }
    ],
    [['column-width', '--width', '400'], { operation: 'column-width', width: 400 }]
  ]
  for (const [args, params] of cases) {
    await run(args)
    expect(call).toHaveBeenLastCalledWith('ui.workspaceBoardViewer', { viewer: 'host', ...params })
    expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({ result: { viewerId: 7 } })
  }
})
it('rejects missing or invalid options before RPC', async () => {
  for (const args of [
    ['status-rename', '--status', 'a'],
    ['status-rename', '--status', 'a', '--label', '  '],
    ['status-rename', '--status', 'a', '--label', 'a', '--label', 'b'],
    ['status-color', '--status', 'a', '--color', '#fff'],
    ['status-icon', '--status', 'a', '--icon', 'skull'],
    ['status-move', '--status', 'a', '--direction', 'up'],
    ['status-remove'],
    ['column-width', '--width', 'wide'],
    ['column-width', '--width', '100']
  ]) {
    await expect(run(args)).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})
it('refuses an older runtime without a peer fallback', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old'))
  await expect(run(['get'])).rejects.toMatchObject({
    code: 'incompatible_runtime',
    message: expect.stringContaining('Update the target runtime')
  })
})
it('salvages future outcomes but rejects malformed target identity', () => {
  expect(
    WorkspaceBoardResultSchema.parse({ ...result, writeOutcome: 'future', reason: 'future' })
  ).toMatchObject({ writeOutcome: 'unknown', reason: 'viewer_not_applied' })
  expect(WorkspaceBoardResultSchema.safeParse({ ...result, viewerId: '7' }).success).toBe(false)
})
