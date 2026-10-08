import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { WorkspaceListViewerResultSchema } from '../shared/workspace-list-viewer-command'
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
  metadataPersisted: null,
  groupBy: 'repo',
  sortBy: 'recent',
  projectOrderBy: 'manual',
  collapsedGroups: [],
  rendered: null
}
afterEach(() => {
  call.mockReset()
  output.mockClear()
})
it('routes explicit list modes through the public parser and target runtime', async () => {
  call.mockResolvedValue({ id: 'r', ok: true, _meta: { runtimeId: 'host' }, result })
  for (const args of [
    ['get'],
    ['group', '--by', 'none'],
    ['sort', '--by', 'name'],
    ['project-order', '--by', 'recent'],
    ['group-toggle', '--group-key', 'repo:one']
  ]) {
    const parsed = parseArgs(
      ['ui', 'workspace-list', ...args, '--viewer', 'host', '--json'],
      COMMAND_SPECS.map((s) => s.path),
      COMMAND_SPECS
    )
    await dispatch(parsed.commandPath, { client, flags: parsed.flags, cwd: '/unused', json: true })
    expect(call).toHaveBeenLastCalledWith(
      'ui.workspaceListViewer',
      expect.objectContaining({ viewer: 'host', operation: args[0] })
    )
    expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({ result: { viewerId: 7 } })
  }
})
it('rejects invalid options and missing viewer before RPC', async () => {
  for (const flags of [
    new Map([
      ['viewer', 'host'],
      ['by', 'invalid']
    ]),
    new Map([['by', 'repo']])
  ]) {
    await expect(
      dispatch(['ui', 'workspace-list', 'group'], { client, flags, cwd: '/unused', json: true })
    ).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})
it('sends the explicit group key and rejects a missing one before RPC', async () => {
  call.mockResolvedValue({ id: 'r', ok: true, _meta: { runtimeId: 'host' }, result })
  await dispatch(['ui', 'workspace-list', 'group-toggle'], {
    client,
    flags: new Map([
      ['viewer', 'host'],
      ['group-key', 'repo:one']
    ]),
    cwd: '/unused',
    json: true
  })
  expect(call).toHaveBeenCalledWith('ui.workspaceListViewer', {
    viewer: 'host',
    operation: 'group-toggle',
    groupKey: 'repo:one'
  })
  call.mockClear()
  await expect(
    dispatch(['ui', 'workspace-list', 'group-toggle'], {
      client,
      flags: new Map([['viewer', 'host']]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
it('refuses an older runtime without a peer fallback', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old'))
  await expect(
    dispatch(['ui', 'workspace-list', 'get'], {
      client,
      flags: new Map([['viewer', 'host']]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('Update the target runtime')
})
it('salvages future outcomes but rejects malformed target identity', () => {
  expect(
    WorkspaceListViewerResultSchema.parse({
      ...result,
      writeOutcome: 'future',
      reason: 'future',
      future: true
    })
  ).toMatchObject({ writeOutcome: 'unknown', reason: 'viewer_not_applied' })
  expect(WorkspaceListViewerResultSchema.safeParse({ ...result, viewerId: '7' }).success).toBe(
    false
  )
})
