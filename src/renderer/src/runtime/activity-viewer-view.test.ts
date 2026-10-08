import { afterEach, expect, it, vi } from 'vitest'
import { publishActivityViewerView, readActivityViewerView } from './activity-viewer-view'
import type { ActivityViewerSnapshot } from '../../../shared/activity-viewer-command'
const view: ActivityViewerSnapshot = {
  surface: 'activity-page',
  runtimeContextKey: 'local',
  groupBy: 'none',
  readFilter: 'all',
  compact: false,
  showChildAgents: true,
  querySettled: true,
  densityMeasured: false,
  selectedPaneKey: null,
  logicalRows: [{ key: 't:one', kind: 'thread', hostId: 'ssh:one', workspaceId: 'one' }],
  renderedRows: []
}
afterEach(() => {
  publishActivityViewerView('activity-page', null)
  vi.unstubAllGlobals()
})
it('requires the actual surface and measures only committed logical rows', () => {
  const root = {
    getBoundingClientRect: () => ({ width: 320, height: 500 }),
    closest: () => null,
    getAttribute: () => 'false',
    querySelectorAll: () => [
      { getAttribute: () => 't:one', getBoundingClientRect: () => ({ height: 118 }) },
      { getAttribute: () => 't:stale', getBoundingClientRect: () => ({ height: 98 }) }
    ]
  }
  vi.stubGlobal('document', { querySelector: vi.fn(() => root) })
  expect(readActivityViewerView('activity-page')).toBeNull()
  publishActivityViewerView('activity-page', view)
  expect(readActivityViewerView('activity-page')).toMatchObject({
    densityMeasured: true,
    renderedRows: [{ key: 't:one', height: 118 }]
  })
  expect(readActivityViewerView('sidebar-agents')).toBeNull()
  root.getBoundingClientRect = () => ({ width: 0, height: 500 })
  expect(readActivityViewerView('activity-page')).toBeNull()
})
