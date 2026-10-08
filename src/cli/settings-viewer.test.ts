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

it('routes explicit settings panes and empty searches through public CLI parsing', async () => {
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target-host' },
    result: {
      viewer: 'host',
      viewerId: 7,
      applied: true,
      activeSectionId: 'general',
      resolvedSectionId: 'general',
      queryInput: '',
      queryApplied: '',
      visibleSectionIds: ['general'],
      renderedSectionIds: ['general'],
      sectionTargetPresent: true
    }
  })
  for (const args of [
    ['open', '--pane', 'general'],
    ['search', '--query', '']
  ]) {
    const parsed = parseArgs(
      ['ui', 'settings', ...args, '--viewer', 'host', '--json'],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith(
      'ui.settingsViewer',
      expect.objectContaining({ viewer: 'host', operation: args[0] })
    )
    expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({
      _meta: { runtimeId: 'target-host' },
      result: { applied: true, viewerId: 7 }
    })
  }
})

it('rejects missing viewers and invalid project targets before sending anything', async () => {
  for (const flags of [
    new Map([['pane', 'general']]),
    new Map([
      ['viewer', 'host'],
      ['pane', 'repo']
    ]),
    new Map([
      ['viewer', 'host'],
      ['pane', 'general'],
      ['repo', 'a']
    ])
  ]) {
    await expect(
      dispatch(['ui', 'settings', 'open'], { client, flags, cwd: '/unused', json: true })
    ).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})

it('refuses an old host without changing another runtime', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old host'))
  await expect(
    dispatch(['ui', 'settings', 'open'], {
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['pane', 'general']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('Update the target runtime')
  expect(call).toHaveBeenCalledTimes(1)
})
