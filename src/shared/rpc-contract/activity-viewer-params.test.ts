import { expect, it } from 'vitest'
import { ActivityViewerParams } from './activity-viewer-params'
it('requires an explicit host and activity surface with existing preference domains', () => {
  for (const surface of ['sidebar-agents', 'activity-page']) {
    for (const command of [
      { operation: 'get' },
      { operation: 'group', by: 'project' },
      { operation: 'read', filter: 'unread' },
      { operation: 'compact', enabled: false },
      { operation: 'children', enabled: true }
    ]) {
      expect(ActivityViewerParams.safeParse({ viewer: 'host', surface, ...command }).success).toBe(
        true
      )
    }
  }
  for (const command of [
    { viewer: 'host', operation: 'get' },
    { viewer: 'host', surface: 'unknown', operation: 'get' },
    { viewer: 'peer', surface: 'sidebar-agents', operation: 'get' },
    { viewer: 'host', surface: 'activity-page', operation: 'group', by: 'repo' },
    { viewer: 'host', surface: 'activity-page', operation: 'compact', enabled: 'true' }
  ]) {
    expect(ActivityViewerParams.safeParse(command).success).toBe(false)
  }
})
