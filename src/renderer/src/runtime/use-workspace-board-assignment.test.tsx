// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { buildUnambiguousWorktreeIdIndex } from '@/components/sidebar/worktree-unambiguous-id-index'
import { normalizeWorkspaceStatuses } from '../../../shared/workspace-statuses'
import type { Worktree } from '../../../shared/worktree/types'
import {
  listAssignableBoardWorkspaces,
  useWorkspaceBoardAssignment
} from './use-workspace-board-assignment'

const statuses = normalizeWorkspaceStatuses([
  { id: 'todo', label: 'Todo' },
  { id: 'doing', label: 'Doing' }
])
const makeWorktree = (id: string, overrides: Partial<Worktree> = {}): Worktree => ({
  id,
  repoId: id.split('::')[0],
  path: `/tmp/${id}`,
  head: 'abc123',
  branch: 'refs/heads/feature',
  isBare: false,
  isMainWorktree: false,
  displayName: id,
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  linkedGitLabMR: null,
  linkedGitLabIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0,
  ...overrides
})
afterEach(cleanup)

it('lists the unambiguous workspaces the board shows with the status each lane holds', () => {
  const shown = [
    makeWorktree('r1::/a', { workspaceStatus: 'doing' }),
    makeWorktree('r1::/b'),
    makeWorktree('r2::/dup', { hostId: 'ssh:one' }),
    makeWorktree('r2::/dup', { hostId: 'ssh:two' }),
    makeWorktree('r3::/c', { hostId: 'ssh:box', workspaceStatus: 'retired-status' })
  ]
  const hidden = makeWorktree('r1::/hidden')
  const index = buildUnambiguousWorktreeIdIndex([...shown, hidden])
  expect(listAssignableBoardWorkspaces(shown, index, statuses)).toEqual([
    { id: 'r1::/a', repoId: 'r1', statusId: 'doing', hostId: 'local' },
    { id: 'r1::/b', repoId: 'r1', statusId: 'todo', hostId: 'local' },
    { id: 'r3::/c', repoId: 'r3', statusId: 'todo', hostId: 'ssh:box' }
  ])
})

const renderAssignment = (syncEnabled: boolean, moveWorktreesToStatus = vi.fn()) => {
  const board = [makeWorktree('r1::/a'), makeWorktree('r1::/b', { workspaceStatus: 'doing' })]
  const worktreeById = buildUnambiguousWorktreeIdIndex(board)
  const hook = renderHook(() =>
    useWorkspaceBoardAssignment({
      boardWorktrees: board,
      worktreeById,
      workspaceStatuses: statuses,
      syncTaskStatusFromWorkspaceBoard: syncEnabled,
      moveWorktreesToStatus
    })
  )
  return { hook, moveWorktreesToStatus }
}

it('moves through the board handler and reports a sync request only when the board would send one', () => {
  const off = renderAssignment(false)
  expect(off.hook.result.current.assignWorkspaces(['r1::/a'], 'doing')).toEqual({
    taskStatusSyncRequested: false
  })
  expect(off.moveWorktreesToStatus).toHaveBeenCalledExactlyOnceWith(['r1::/a'], 'doing')
  const on = renderAssignment(true)
  expect(on.hook.result.current.assignWorkspaces(['r1::/a', 'r1::/b'], 'doing')).toEqual({
    taskStatusSyncRequested: true
  })
  // Already in the target lane: the board skips the move and its sync, so none is requested.
  expect(on.hook.result.current.assignWorkspaces(['r1::/b'], 'doing')).toEqual({
    taskStatusSyncRequested: false
  })
})
it('memoizes the published workspaces until the board changes', () => {
  const { hook } = renderAssignment(false)
  const first = hook.result.current.workspaces
  hook.rerender()
  expect(hook.result.current.workspaces).toBe(first)
})
