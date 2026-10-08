import { z } from 'zod'
import { openEnum } from './zod-salvage'
import { DEFAULT_SHOW_SLEEPING_WORKSPACES } from './constants'
import {
  WorkspaceFiltersSchema,
  type WorkspaceFilters,
  type WorkspaceFilterCommand
} from './rpc-contract/workspace-filter-params'

export const WORKSPACE_FILTER_FIELDS = [
  'showSleepingWorkspaces',
  'alwaysShowDefaultBranchWorkspace',
  'hideDefaultBranchWorkspace',
  'hideAutomationGeneratedWorkspaces',
  'hideCliCreatedWorkspaces',
  'hideDetachedHeadWorkspaces',
  'filterRepoIds'
] as const

export function readWorkspaceFilters(
  state: Omit<WorkspaceFilters, 'filterRepoIds'> & { filterRepoIds: readonly string[] }
): WorkspaceFilters {
  return {
    showSleepingWorkspaces: state.showSleepingWorkspaces,
    alwaysShowDefaultBranchWorkspace: state.alwaysShowDefaultBranchWorkspace,
    hideDefaultBranchWorkspace: state.hideDefaultBranchWorkspace,
    hideAutomationGeneratedWorkspaces: state.hideAutomationGeneratedWorkspaces,
    hideCliCreatedWorkspaces: state.hideCliCreatedWorkspaces,
    hideDetachedHeadWorkspaces: state.hideDetachedHeadWorkspaces,
    filterRepoIds: [...state.filterRepoIds]
  }
}

export function defaultWorkspaceFilters(): WorkspaceFilters {
  return {
    showSleepingWorkspaces: DEFAULT_SHOW_SLEEPING_WORKSPACES,
    alwaysShowDefaultBranchWorkspace: true,
    hideDefaultBranchWorkspace: false,
    hideAutomationGeneratedWorkspaces: false,
    hideCliCreatedWorkspaces: false,
    hideDetachedHeadWorkspaces: false,
    filterRepoIds: []
  }
}

export function sameWorkspaceFilters(left: WorkspaceFilters, right: WorkspaceFilters): boolean {
  return WORKSPACE_FILTER_FIELDS.every((key) =>
    key === 'filterRepoIds'
      ? left.filterRepoIds.length === right.filterRepoIds.length &&
        left.filterRepoIds.every((id, index) => id === right.filterRepoIds[index])
      : left[key] === right[key]
  )
}

export const WorkspaceFilterResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    filters: WorkspaceFiltersSchema.strip(),
    persisted: z.boolean().nullable(),
    applied: z.boolean(),
    visibleWorktreeIds: z.array(z.string()).nullable(),
    visibleFolderWorkspaceIds: z.array(z.string()).nullable(),
    reason: openEnum(
      [
        'persistence_superseded',
        'viewer_not_applied',
        'viewer_runtime_changed_persistence_unknown'
      ],
      'viewer_not_applied'
    ).optional(),
    control: z
      .object({
        open: z.boolean(),
        query: z.string(),
        highlightedRepoId: z.string(),
        resultRepoIds: z.array(z.string()),
        inputFocused: z.boolean()
      })
      .strip()
      .optional()
  })
  .strip()
export type WorkspaceFilterResult = z.infer<typeof WorkspaceFilterResultSchema>
export type WorkspaceFilterRequest = {
  id: string
  expiresAt: number
  command: WorkspaceFilterCommand
}
export type WorkspaceFilterResponse = { id: string } & (
  | { ok: true; result: WorkspaceFilterResult }
  | { ok: false; error: string }
)
