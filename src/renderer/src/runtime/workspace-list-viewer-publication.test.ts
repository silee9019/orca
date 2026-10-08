import { expect, it, vi } from 'vitest'
vi.mock('@/store', () => ({ useAppStore: vi.fn() }))
import {
  workspaceListCollapsibleKeys,
  workspaceListViewerRows
} from './use-workspace-list-viewer-publication'
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
it('publishes the key every header click toggles, plus host headers and parents with children', () => {
  const header = (key: string, patch: object = {}) => ({
    type: 'header' as const,
    key,
    label: key,
    count: 1,
    tone: '',
    ...patch
  })
  expect(
    workspaceListCollapsibleKeys([
      { type: 'host-header', key: 'host:a' },
      header('pinned', { collapseKey: 'host:a:pinned' }),
      header('all'),
      header('pr:done', { count: 0 }),
      { type: 'item', lineageChildCount: 2, lineageGroupKey: 'lineage:w' },
      { type: 'item', lineageChildCount: 0 },
      { type: 'pending-creation' }
    ])
  ).toEqual(['host:a', 'host:a:pinned', 'all', 'pr:done', 'lineage:w'])
})
