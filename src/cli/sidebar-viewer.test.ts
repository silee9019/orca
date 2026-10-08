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
it('parses and routes only explicit sidebar and panel commands', async () => {
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target-host' },
    result: {
      viewer: 'host',
      viewerId: 7,
      dispatched: true,
      applied: true,
      persisted: null,
      sidebarOpen: false,
      rightSidebarOpen: true,
      rightSidebarTab: 'explorer',
      explorerView: 'files',
      rendered: {
        leftMounted: true,
        leftVisible: false,
        rightMounted: true,
        rightVisible: true,
        panel: 'explorer',
        explorerView: 'files',
        panelReady: true,
        availablePanels: ['explorer']
      }
    }
  })
  for (const args of [
    ['sidebar', 'get'],
    ['sidebar', 'toggle', '--side', 'left'],
    ['panel', 'open', '--panel', 'files']
  ]) {
    const parsed = parseArgs(
      ['ui', ...args, '--viewer', 'host', '--json'],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith(
      'ui.sidebarViewer',
      expect.objectContaining({ viewer: 'host' })
    )
    expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({
      _meta: { runtimeId: 'target-host' },
      result: { applied: true, viewerId: 7, persisted: null }
    })
  }
})
it('rejects missing or unsupported viewers before a request', async () => {
  for (const flags of [
    new Map([['side', 'left']]),
    new Map([
      ['viewer', 'other'],
      ['side', 'left']
    ]),
    new Map([
      ['viewer', 'host'],
      ['side', 'invalid']
    ])
  ]) {
    await expect(
      dispatch(['ui', 'sidebar', 'toggle'], { client, flags, cwd: '/unused', json: true })
    ).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})
it('refuses an old host without borrowing another viewer', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old host'))
  await expect(
    dispatch(['ui', 'sidebar', 'get'], {
      client,
      flags: new Map([['viewer', 'host']]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('Update the target runtime')
  expect(call).toHaveBeenCalledTimes(1)
})
