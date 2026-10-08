import { z } from 'zod'
import { ExecutionHostId } from './automation-params'

const LineageTargetFields = {
  worktreeId: z.string().min(1).max(2048),
  executionHostId: ExecutionHostId
}
export const DesktopWorktreeInstanceTarget = z.union([
  z.object({ ...LineageTargetFields, identityKey: z.string().min(1).max(4096) }).strict(),
  z.object({ ...LineageTargetFields, instanceId: z.string().min(1).max(512) }).strict()
])

export function getDesktopLineageTargetConfirmation(
  target: z.infer<typeof DesktopWorktreeInstanceTarget>
): string {
  return 'identityKey' in target ? target.identityKey : `${target.worktreeId}:${target.instanceId}`
}

export const DesktopWorktreeLineageUpdate = z
  .object({
    target: DesktopWorktreeInstanceTarget,
    parent: DesktopWorktreeInstanceTarget.optional(),
    noParent: z.literal(true).optional()
  })
  .strict()
  .refine((value) => Boolean(value.parent) !== (value.noParent === true), {
    message: 'Choose exactly one parent or noParent: true.'
  })
