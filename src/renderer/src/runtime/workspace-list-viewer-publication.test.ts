import { expect, it, vi } from 'vitest'
vi.mock('@/store', () => ({ useAppStore: vi.fn() }))
import { workspaceListViewerRows } from './use-workspace-list-viewer-publication'
it('retains the host-qualified row key and existing default host fallback for pending creation', () => {
  expect(
    workspaceListViewerRows(
      [
        {
          type: 'pending-creation',
          key: 'pending:creation',
          creationId: 'creation',
          repo: undefined
        }
      ],
      'ssh:fixture'
    )
  ).toEqual([
    { type: 'pending-creation', key: 'pending:creation', workspaceId: null, hostId: 'ssh:fixture' }
  ])
})
