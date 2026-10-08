import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import type { RuntimeClient } from './runtime-client'
import { RuntimeClientError } from './runtime-client'

const call = vi.fn().mockResolvedValue({
  id: 'r',
  ok: true,
  _meta: { runtimeId: 'selected-host' },
  result: {
    viewer: 'host',
    viewerId: 42,
    repoIds: ['a'],
    persisted: true,
    applied: true,
    visibleWorktreeIds: ['a::worktree']
  }
})
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: These handlers only call the runtime RPC method, supplied by this double.
const client = { call } as unknown as RuntimeClient
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => {
  call.mockClear()
  output.mockClear()
})

describe('project filter CLI', () => {
  it('routes get/set/clear to the selected runtime with an explicit viewer', async () => {
    for (const operation of ['get', 'set', 'clear']) {
      const args = [
        'ui',
        'project-filter',
        operation,
        '--viewer',
        'host',
        '--json',
        ...(operation === 'set' ? ['--repo', 'a', '--repo', 'b'] : [])
      ]
      const parsed = parseArgs(
        args,
        COMMAND_SPECS.map((spec) => spec.path),
        COMMAND_SPECS
      )
      await dispatch(parsed.commandPath, {
        client,
        flags: parsed.flags,
        cwd: '/unused',
        json: true
      })
      expect(call).toHaveBeenLastCalledWith('ui.projectFilter', {
        viewer: 'host',
        operation,
        ...(operation === 'set' ? { repoIds: ['a', 'b'] } : {})
      })
      expect(JSON.parse(output.mock.calls.at(-1)?.[0])._meta.runtimeId).toBe('selected-host')
    }
  })
  it('refuses a missing viewer or set without projects before contacting a runtime', async () => {
    await expect(
      dispatch(['ui', 'project-filter', 'get'], {
        client,
        flags: new Map(),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow('Missing required --viewer')
    await expect(
      dispatch(['ui', 'project-filter', 'set'], {
        client,
        flags: new Map([['viewer', 'host']]),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow('set requires')
    expect(call).not.toHaveBeenCalled()
  })
  it('does not fall back to this computer when an old remote runtime refuses the method', async () => {
    call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old host'))
    await expect(
      dispatch(['ui', 'project-filter', 'clear'], {
        client,
        flags: new Map([['viewer', 'host']]),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow('Update the selected Orca runtime')
    expect(call).toHaveBeenCalledTimes(1)
  })
})
