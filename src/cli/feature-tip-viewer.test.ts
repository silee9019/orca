import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { FeatureTipViewerResultSchema } from '../shared/feature-tip-viewer-command'

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
  tipId: 'cmd-j-palette',
  open: false,
  rendered: { runtimeContextKey: 'local#0', open: false, tipId: null, action: null }
}
const run = (args: string[]) => {
  const parsed = parseArgs(
    ['ui', 'feature-tip', ...args, '--viewer', 'host', '--json'],
    COMMAND_SPECS.map((s) => s.path),
    COMMAND_SPECS
  )
  return dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
}
afterEach(() => {
  call.mockReset()
  output.mockClear()
})

it('routes get and skip through the public parser with explicit options', async () => {
  call.mockResolvedValue({ id: 'r', ok: true, _meta: { runtimeId: 'host' }, result })
  const cases: [string[], Record<string, unknown>][] = [
    [['get'], { operation: 'get' }],
    [['skip'], { operation: 'skip' }],
    [['skip', '--tip', 'cmd-j-palette'], { operation: 'skip', tipId: 'cmd-j-palette' }]
  ]
  for (const [args, params] of cases) {
    await run(args)
    expect(call).toHaveBeenLastCalledWith('ui.featureTipViewer', { viewer: 'host', ...params })
    expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({ result: { viewerId: 7 } })
  }
})
it('rejects an unknown, empty or repeated --tip before any RPC', async () => {
  for (const args of [
    ['skip', '--tip', 'nope'],
    ['skip', '--tip', ''],
    ['skip', '--tip='],
    ['skip', '--tip'],
    ['skip', '--tip', 'orca-cli', '--tip', 'cmd-j-palette'],
    ['get', '--tip', 'orca-cli']
  ]) {
    await expect(run(args)).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})
it('tells an older runtime to update, for a missing method or an unknown operation', async () => {
  for (const code of ['method_not_found', 'invalid_argument']) {
    call.mockRejectedValueOnce(new RuntimeClientError(code, 'old'))
    await expect(run(['skip'])).rejects.toMatchObject({
      code: 'incompatible_runtime',
      message: expect.stringContaining('Update the target runtime')
    })
  }
})
it('passes a host rejection of get through instead of calling the runtime old', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('invalid_argument', 'bad'))
  await expect(run(['get'])).rejects.toMatchObject({ code: 'invalid_argument', message: 'bad' })
})
it('keeps future outcomes safe and rejects malformed identity', () => {
  expect(
    FeatureTipViewerResultSchema.parse({ ...result, writeOutcome: 'future', reason: 'future' })
  ).toMatchObject({ writeOutcome: 'unknown', reason: 'feature_tip_still_open' })
  expect(FeatureTipViewerResultSchema.safeParse({ ...result, viewerId: '7' }).success).toBe(false)
})
