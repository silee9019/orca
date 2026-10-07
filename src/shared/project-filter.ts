import { z } from 'zod'
import type { ProjectFilterOperation } from './rpc-contract/project-filter-params'

export type ProjectFilterRequest = {
  id: string
  expiresAt: number
  command: ProjectFilterOperation
}
export const ProjectFilterResultSchema = z.object({
  viewer: z.literal('host'),
  viewerId: z.number().int(),
  repoIds: z.array(z.string()),
  persisted: z.boolean(),
  applied: z.boolean(),
  visibleWorktreeIds: z.array(z.string()).nullable(),
  visibleFolderWorkspaceIds: z.array(z.string()).nullable(),
  reason: z.string().optional()
})
export type ProjectFilterResult = z.infer<typeof ProjectFilterResultSchema>
export type ProjectFilterResponse = { id: string } & (
  | { ok: true; result: ProjectFilterResult }
  | { ok: false; error: string }
)
