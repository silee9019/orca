import { z } from 'zod'
export const CodexLoginObservationEventSchema = z
  .object({
    type: z.enum(['ready', 'changed']),
    pending: z.boolean(),
    revision: z.number().int().nonnegative()
  })
  .strict()
export type CodexLoginObservationEvent = z.infer<typeof CodexLoginObservationEventSchema>
