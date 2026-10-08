import { z } from 'zod'

export const WorkspaceFiltersSchema = z
  .object({
    showSleepingWorkspaces: z.boolean(),
    alwaysShowDefaultBranchWorkspace: z.boolean(),
    hideDefaultBranchWorkspace: z.boolean(),
    hideAutomationGeneratedWorkspaces: z.boolean(),
    hideCliCreatedWorkspaces: z.boolean(),
    hideDetachedHeadWorkspaces: z.boolean(),
    filterRepoIds: z.array(z.string().min(1)).max(10000)
  })
  .strict()

export const WorkspaceFilterPatchSchema = WorkspaceFiltersSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one filter is required'
)

export const ProjectFilterControlSchema = z.discriminatedUnion('action', [
  z
    .object({
      surface: z.enum(['sidebar', 'workspace-board']),
      action: z.literal('menu'),
      open: z.boolean()
    })
    .strict(),
  z
    .object({
      surface: z.enum(['sidebar', 'workspace-board', 'project-panel']),
      action: z.literal('search'),
      query: z.string().max(2048)
    })
    .strict(),
  z
    .object({
      surface: z.enum(['sidebar', 'workspace-board', 'project-panel']),
      action: z.literal('highlight'),
      repoId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      surface: z.enum(['sidebar', 'workspace-board', 'project-panel']),
      action: z.literal('focus')
    })
    .strict()
])
export type ProjectFilterControl = z.infer<typeof ProjectFilterControlSchema>

export const WorkspaceFilterParams = z.discriminatedUnion('operation', [
  z
    .object({
      viewer: z.literal('host'),
      operation: z.literal('select-project'),
      surface: z.literal('project-panel'),
      repoId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      viewer: z.literal('host'),
      operation: z.literal('remove-last-project'),
      surface: z.literal('project-panel')
    })
    .strict(),
  z
    .object({
      viewer: z.literal('host'),
      operation: z.literal('control'),
      control: ProjectFilterControlSchema
    })
    .strict(),
  z.object({ viewer: z.literal('host'), operation: z.literal('get') }).strict(),
  z
    .object({
      viewer: z.literal('host'),
      operation: z.literal('set'),
      filters: WorkspaceFilterPatchSchema
    })
    .strict(),
  z.object({ viewer: z.literal('host'), operation: z.literal('reset') }).strict(),
  z
    .object({
      viewer: z.literal('host'),
      operation: z.literal('remove-project'),
      repoId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      viewer: z.literal('host'),
      operation: z.literal('toggle-project'),
      repoId: z.string().min(1)
    })
    .strict()
])

export type WorkspaceFilters = z.infer<typeof WorkspaceFiltersSchema>
export type WorkspaceFilterCommand = z.infer<typeof WorkspaceFilterParams>
