import { z } from 'zod'
export const BrowserObservationCommand = z.object({
  kind: z.enum(['visibility', 'driver']),
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  waitMs: z.number().int().min(0).max(5000)
})
export type BrowserObservationCommand = z.infer<typeof BrowserObservationCommand>
const target = { page: z.string().min(1), worktreeId: z.string().min(1), changed: z.boolean() }
export const BrowserObservationState = z.discriminatedUnion('kind', [
  z.object({ ...target, kind: z.literal('visibility'), automationVisible: z.boolean() }),
  z.object({
    ...target,
    kind: z.literal('driver'),
    driver: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('idle') }),
      z.object({ kind: z.literal('desktop') }),
      z.object({ kind: z.literal('mobile'), clientId: z.string() })
    ])
  })
])
export type BrowserObservationState = z.infer<typeof BrowserObservationState>
