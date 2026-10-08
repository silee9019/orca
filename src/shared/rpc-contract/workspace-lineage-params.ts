import { z } from 'zod'
import { ExecutionHostId } from './automation-params'

const LineageTarget = z
  .object({
    worktreeId: z.string().min(1).max(2048),
    executionHostId: ExecutionHostId,
    identityKey: z.string().min(1).max(4096)
  })
  .strict()

export const DesktopWorktreeLineageUpdate = z
  .object({
    target: LineageTarget,
    parent: LineageTarget.optional(),
    noParent: z.literal(true).optional()
  })
  .strict()
  .refine((value) => Boolean(value.parent) !== (value.noParent === true), {
    message: 'Choose exactly one parent or noParent: true.'
  })
