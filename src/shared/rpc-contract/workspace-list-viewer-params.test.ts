import { expect, it } from 'vitest'
import { WorkspaceListViewerParams } from './workspace-list-viewer-params'
it('accepts only explicit workspace list options and host viewer', () => {
  for (const command of [
    { operation: 'get' },
    { operation: 'group', by: 'none' },
    { operation: 'sort', by: 'smart' },
    { operation: 'project-order', by: 'recent' },
    { operation: 'group-toggle', groupKey: 'repo:one' }
  ]) {
    expect(WorkspaceListViewerParams.safeParse({ viewer: 'host', ...command }).success).toBe(true)
  }
  for (const command of [
    { viewer: 'host', operation: 'group', by: 'project' },
    { viewer: 'host', operation: 'sort', by: 'random' },
    { viewer: 'host', operation: 'project-order', by: 'name' },
    { operation: 'get' },
    { viewer: 'peer', operation: 'get' },
    { viewer: 'host', operation: 'get', code: 'anything' },
    { viewer: 'host', operation: 'group-toggle' },
    { viewer: 'host', operation: 'group-toggle', groupKey: '' },
    { viewer: 'host', operation: 'group-toggle', groupKey: 'repo:one', by: 'repo' }
  ]) {
    expect(WorkspaceListViewerParams.safeParse(command).success).toBe(false)
  }
})
