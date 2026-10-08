import { z } from 'zod'

export const AiVaultListCancelParams = z
  .object({
    requestToken: z.string().uuid(),
    expectedRuntimeId: z.string().min(1).max(256),
    confirm: z.literal(true)
  })
  .strict()

export const AiVaultListCapabilitiesParams = z.object({}).strict()
