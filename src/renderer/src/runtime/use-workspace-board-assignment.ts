import { useCallback, useMemo } from 'react'
import { getWorkspaceBoardTaskStatusSyncRequest } from '@/components/sidebar/workspace-board-task-status-sync'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { getWorkspaceStatus } from '../../../shared/workspace-statuses'
import type { WorkspaceBoardWorkspace } from '../../../shared/workspace-board-command'
import type { WorkspaceStatusDefinition, Worktree } from '../../../shared/worktree/types'
import type { WorkspaceBoardControl } from './workspace-board-viewer-view'

// Why: the board moves only workspaces it lists whose id names exactly one of them.
export function listAssignableBoardWorkspaces(
  boardWorktrees: readonly Worktree[],
  worktreeById: ReadonlyMap<string, Worktree>,
  statuses: readonly WorkspaceStatusDefinition[]
): WorkspaceBoardWorkspace[] {
  return boardWorktrees
    .filter((worktree) => worktreeById.get(worktree.id) === worktree)
    .map((worktree) => ({
      id: worktree.id,
      repoId: worktree.repoId,
      statusId: getWorkspaceStatus(worktree, statuses),
      hostId: worktree.hostId ?? LOCAL_EXECUTION_HOST_ID
    }))
}

export function useWorkspaceBoardAssignment(args: {
  boardWorktrees: readonly Worktree[]
  worktreeById: ReadonlyMap<string, Worktree>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  syncTaskStatusFromWorkspaceBoard: boolean
  moveWorktreesToStatus: (worktreeIds: readonly string[], status: string) => void
}): {
  workspaces: WorkspaceBoardWorkspace[]
  assignWorkspaces: WorkspaceBoardControl['assignWorkspaces']
} {
  const {
    boardWorktrees,
    worktreeById,
    workspaceStatuses,
    syncTaskStatusFromWorkspaceBoard,
    moveWorktreesToStatus
  } = args
  const workspaces = useMemo(
    () => listAssignableBoardWorkspaces(boardWorktrees, worktreeById, workspaceStatuses),
    [boardWorktrees, worktreeById, workspaceStatuses]
  )
  const assignWorkspaces = useCallback<WorkspaceBoardControl['assignWorkspaces']>(
    (workspaceIds, statusId) => {
      // Why: asked with the same inputs the board's move uses, so the report matches what it sends.
      const taskStatusSyncRequested =
        getWorkspaceBoardTaskStatusSyncRequest({
          enabled: syncTaskStatusFromWorkspaceBoard,
          worktreeIds: workspaceIds,
          status: statusId,
          worktreesById: worktreeById,
          workspaceStatuses
        }) !== null
      moveWorktreesToStatus(workspaceIds, statusId)
      return { taskStatusSyncRequested }
    },
    [moveWorktreesToStatus, syncTaskStatusFromWorkspaceBoard, worktreeById, workspaceStatuses]
  )
  return { workspaces, assignWorkspaces }
}
