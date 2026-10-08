import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => {
  call.mockReset()
  output.mockClear()
})

it('routes explicit preset and activity commands through the selected host viewer', async () => {
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target-host' },
    result: {
      viewer: 'host',
      viewerId: 7,
      dispatched: true,
      applied: true,
      persisted: true,
      compact: true,
      properties: ['status', 'unread'],
      defaulted: true,
      activityMode: 'full',
      rendered: [],
      futureField: true
    }
  })
  for (const args of [['get'], ['mode', '--mode', 'Compact'], ['activity', '--mode', 'full']]) {
    const parsed = parseArgs(
      ['ui', 'card', ...args, '--viewer', 'host', '--json'],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith(
      'ui.cardViewer',
      expect.objectContaining({ viewer: 'host', operation: args[0] })
    )
    expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({
      _meta: { runtimeId: 'target-host' },
      result: { viewerId: 7, applied: true, persisted: true }
    })
  }
})
it('rejects a missing viewer or invalid mode before dispatch', async () => {
  for (const flags of [
    new Map([['mode', 'Compact']]),
    new Map([
      ['viewer', 'host'],
      ['mode', 'dense']
    ])
  ]) {
    await expect(
      dispatch(['ui', 'card', 'mode'], { client, flags, cwd: '/unused', json: true })
    ).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})
it('refuses an old host without borrowing a peer renderer', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old host'))
  await expect(
    dispatch(['ui', 'card', 'get'], {
      client,
      flags: new Map([['viewer', 'host']]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('Update the target runtime')
  expect(call).toHaveBeenCalledTimes(1)
})
