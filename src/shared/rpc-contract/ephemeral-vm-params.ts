import { z } from 'zod'
const id = z.string().trim().min(1).max(1024)
export const VmRepo = z.object({ repoId: id })
export const VmRuntime = z.object({ runtimeId: id })
export const VmWorkspace = z.object({ workspaceId: id })
export const VmRecipe = z.object({ repoId: id, recipeId: id })
export const VmProvision = VmRecipe.extend({
  provisionId: id,
  workspaceName: id.optional(),
  projectId: id.optional(),
  workspaceId: id.optional(),
  branch: id.optional(),
  ref: id.optional()
})
export const VmProvisionIdentity = z.object({ provisionId: id })
export const VmAttach = VmRuntime.extend({ workspaceId: id })
export const VmStopCleanup = VmRuntime.extend({ confirmation: id }).refine(
  (value) => value.confirmation === value.runtimeId,
  'Confirmation must match the runtime ID'
)
