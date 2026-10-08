import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { defaultWorkspaceFilters } from '../shared/workspace-filter-command'

const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
afterEach(() => {
  call.mockReset()
  output.mockClear()
})

describe('workspace filters through public CLI parsing and dispatch', () => {
  it('routes all commands to the selected host and preserves its response metadata', async () => {
    call.mockResolvedValue({
      id: 'r',
      ok: true,
      _meta: { runtimeId: 'selected-host' },
      result: {
        viewer: 'host',
        viewerId: 42,
        filters: defaultWorkspaceFilters(),
        persisted: true,
        applied: false,
        visibleWorktreeIds: null,
        visibleFolderWorkspaceIds: null
      }
    })
    for (const operation of ['get', 'set', 'reset']) {
      const parsed = parseArgs(
        [
          'ui',
          'workspace-filter',
          operation,
          '--viewer',
          'host',
          '--json',
          ...(operation === 'set' ? ['--filters', '{"hideCliCreatedWorkspaces":true}'] : [])
        ],
        COMMAND_SPECS.map((spec) => spec.path),
        COMMAND_SPECS
      )
      await dispatch(parsed.commandPath, {
        client,
        flags: parsed.flags,
        cwd: '/unused',
        json: true
      })
      expect(call).toHaveBeenLastCalledWith('ui.workspaceFilter', {
        viewer: 'host',
        operation,
        ...(operation === 'set' ? { filters: { hideCliCreatedWorkspaces: true } } : {})
      })
      expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({
        _meta: { runtimeId: 'selected-host' },
        result: { viewerId: 42, persisted: true, applied: false }
      })
    }
  })
  it('routes menu and empty search queries to explicit filter surfaces', async () => {
    call.mockResolvedValue({
      id: 'r',
      ok: true,
      _meta: { runtimeId: 'selected-host' },
      result: {
        viewer: 'host',
        viewerId: 42,
        filters: defaultWorkspaceFilters(),
        persisted: true,
        applied: true,
        visibleWorktreeIds: [],
        visibleFolderWorkspaceIds: [],
        control: {
          open: true,
          query: '',
          highlightedRepoId: '',
          resultRepoIds: [],
          inputFocused: false
        }
      }
    })
    for (const { verb, args, control } of [
      { verb: 'menu', args: ['--state', 'open'], control: { action: 'menu', open: true } },
      { verb: 'search', args: ['--query', ''], control: { action: 'search', query: '' } }
    ]) {
      const parsed = parseArgs(
        [
          'ui',
          verb === 'menu' ? 'workspace-filter' : 'project-filter',
          verb,
          '--viewer',
          'host',
          '--surface',
          'workspace-board',
          ...args
        ],
        COMMAND_SPECS.map((spec) => spec.path),
        COMMAND_SPECS
      )
      await dispatch(parsed.commandPath, {
        client,
        flags: parsed.flags,
        cwd: '/unused',
        json: true
      })
      expect(call).toHaveBeenLastCalledWith('ui.workspaceFilter', {
        viewer: 'host',
        operation: 'control',
        control: { surface: 'workspace-board', ...control }
      })
    }
  })
  it('rejects missing viewers and unknown or invalid fields before any runtime call', async () => {
    await expect(
      dispatch(['ui', 'workspace-filter', 'get'], {
        client,
        flags: new Map(),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow('--viewer')
    for (const filters of [
      '{"windowBounds":{}}',
      '{}',
      '{"hideCliCreatedWorkspaces":"false"}',
      'null',
      'broken'
    ]) {
      await expect(
        dispatch(['ui', 'workspace-filter', 'set'], {
          client,
          flags: new Map([
            ['viewer', 'host'],
            ['filters', filters]
          ]),
          cwd: '/unused',
          json: true
        })
      ).rejects.toThrow()
    }
    expect(call).not.toHaveBeenCalled()
  })
  it('refuses an old host without retrying against a different runtime', async () => {
    call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old host'))
    await expect(
      dispatch(['ui', 'workspace-filter', 'reset'], {
        client,
        flags: new Map([['viewer', 'host']]),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow('Update the target runtime')
    expect(call).toHaveBeenCalledTimes(1)
  })
})
