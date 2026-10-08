// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import {
  publishWorkspaceListViewerView,
  readWorkspaceListViewerView
} from './workspace-list-viewer-view'
const snapshot = {
  groupBy: 'repo',
  sortBy: 'name',
  projectOrderBy: 'manual',
  collapsedGroups: [],
  runtimeContextKey: 'local#0',
  empty: false,
  rows: [{ type: 'item', key: 'host-qualified-row', hostId: 'ssh:host' }]
}
afterEach(() => {
  document.body.innerHTML = ''
  publishWorkspaceListViewerView(null)
})
it('requires a measured mounted list and honors the actual empty consumer', () => {
  publishWorkspaceListViewerView(snapshot)
  expect(readWorkspaceListViewerView()).toBeNull()
  const node = document.createElement('div')
  node.setAttribute('data-worktree-sidebar-container', '')
  document.body.append(node)
  node.getBoundingClientRect = () => new DOMRect(0, 0, 250, 400)
  expect(readWorkspaceListViewerView()).toEqual(snapshot)
  node.setAttribute('data-workspace-list-empty', '')
  expect(readWorkspaceListViewerView()).toMatchObject({ empty: true, rows: [] })
  node.getBoundingClientRect = () => new DOMRect(0, 0, 0, 400)
  expect(readWorkspaceListViewerView()).toBeNull()
})
