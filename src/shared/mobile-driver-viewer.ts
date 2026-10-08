import { z } from 'zod'
const target = { viewerId: z.number().int().positive(), ptyId: z.string().min(1) }
export const MobileDriverViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...target,
      operation: z.enum(['mobile-driver.get', 'mobile-driver.collapse', 'mobile-driver.expand'])
    })
    .strict(),
  z
    .object({
      ...target,
      operation: z.enum(['mobile-driver.restore', 'mobile-driver.restore-all']),
      confirmTarget: z.string().min(1)
    })
    .strict()
])
export const MobileDriverViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.null(),
    state: z
      .object({
        driving: z.boolean(),
        heldFit: z.boolean(),
        collapsed: z.boolean(),
        pending: z.boolean(),
        remainingCount: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict()
export type MobileDriverViewerResult = z.infer<typeof MobileDriverViewerResultSchema>
