// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { readCardViewerView } from './card-viewer-view'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
it('reads committed card values and excludes cards inside a collapsed sidebar', () => {
  const sidebar = document.createElement('div')
  sidebar.dataset.viewerSidebar = 'left'
  const card = document.createElement('div')
  Object.assign(card.dataset, {
    worktreeCardViewerId: 'workspace',
    worktreeCardViewerRepo: 'project',
    worktreeCardViewerHost: 'ssh-host',
    worktreeCardCompact: 'false',
    worktreeCardNewStyle: 'true',
    worktreeCardProperties: 'status,unread',
    worktreeCardActivity: 'full',
    worktreeCardRuntime: 'local#0'
  })
  sidebar.append(card)
  document.body.append(sidebar)
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 60))
  const width = vi
    .spyOn(sidebar, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 240, 500))
  expect(readCardViewerView()).toEqual([
    {
      id: 'workspace',
      repoId: 'project',
      hostId: 'ssh-host',
      compact: false,
      newStyle: true,
      properties: ['status', 'unread'],
      activityMode: 'full',
      runtimeContextKey: 'local#0'
    }
  ])
  width.mockReturnValue(new DOMRect(0, 0, 0, 500))
  expect(readCardViewerView()).toEqual([])
})
