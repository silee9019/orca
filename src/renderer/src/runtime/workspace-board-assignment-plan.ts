import type { WorkspaceBoardCommand } from '../../../shared/rpc-contract/workspace-board-params'
import type {
  WorkspaceBoardResult,
  WorkspaceBoardSnapshot,
  WorkspaceBoardWorkspace
} from '../../../shared/workspace-board-command'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import type { LocalHostWrite } from './workspace-board-local-host-readback'

type AssignCommand = Extract<WorkspaceBoardCommand, { operation: 'assign' }>
export type AssignmentPlan = {
  statusId: string
  entries: { workspace: WorkspaceBoardWorkspace; changed: boolean }[]
}

export function planWorkspaceAssignment(
  command: AssignCommand,
  view: WorkspaceBoardSnapshot
): AssignmentPlan {
  if (!view.workspaces) {
    throw new Error('workspace_board_unavailable')
  }
  if (!view.statuses.some((status) => status.id === command.statusId)) {
    throw new Error('workspace_status_unavailable')
  }
  const ids = [...new Set(command.workspaceIds)]
  // Why: a project-group folder workspace has no board lane, so the board's move would skip it silently.
  if (ids.some((id) => parseWorkspaceKey(id)?.type === 'folder')) {
    throw new Error('workspace_folder_unsupported')
  }
  const byId = new Map(view.workspaces.map((workspace) => [workspace.id, workspace]))
  return {
    statusId: command.statusId,
    entries: ids.map((id) => {
      const workspace = byId.get(id)
      if (!workspace) {
        throw new Error('workspace_unavailable')
      }
      return { workspace, changed: workspace.statusId !== command.statusId }
    })
  }
}

export function changedAssignmentIds(plan: AssignmentPlan): string[] {
  return plan.entries.filter((entry) => entry.changed).map((entry) => entry.workspace.id)
}

export function boardShowsAssignment(plan: AssignmentPlan, view: WorkspaceBoardSnapshot | null) {
  const shown = new Map(view?.workspaces?.map((workspace) => [workspace.id, workspace.statusId]))
  return plan.entries.every(
    (entry) => !entry.changed || shown.get(entry.workspace.id) === plan.statusId
  )
}

export function buildAssignmentReport(
  plan: AssignmentPlan,
  hostWrites: ReadonlyMap<string, LocalHostWrite>,
  taskStatusSyncRequested: boolean
): NonNullable<WorkspaceBoardResult['assignment']> {
  return {
    statusId: plan.statusId,
    workspaces: plan.entries.map(({ workspace, changed }) => ({
      workspaceId: workspace.id,
      hostId: workspace.hostId,
      changed,
      hostWrite: !changed
        ? 'not_requested'
        : workspace.hostId === LOCAL_EXECUTION_HOST_ID
          ? (hostWrites.get(workspace.id) ?? 'unverifiable')
          : 'unverifiable'
    })),
    taskStatusSync: taskStatusSyncRequested ? 'requested' : 'not_requested',
    writeFailureReporting: 'swallowed_by_store'
  }
}

// Why: one failed host write must not be hidden by confirmed siblings or by an unverifiable remote one.
export function assignmentPersisted(
  report: NonNullable<WorkspaceBoardResult['assignment']>
): boolean | null {
  const changed = report.workspaces.filter((workspace) => workspace.changed)
  if (changed.some((workspace) => workspace.hostWrite === 'not_confirmed')) {
    return false
  }
  return changed.length > 0 && changed.every((workspace) => workspace.hostWrite === 'confirmed')
    ? true
    : null
}
