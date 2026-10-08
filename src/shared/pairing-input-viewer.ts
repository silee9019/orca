import { z } from 'zod'
const target = { viewerId: z.number().int().positive(), surface: z.enum(['sidebar', 'web']) }
export const PairingInputViewerParams = z.discriminatedUnion('operation', [
  z.object({ ...target, operation: z.literal('pairing-input.get') }).strict(),
  z
    .object({ ...target, operation: z.literal('pairing-input.set'), value: z.string().max(65536) })
    .strict()
])
export const PairingInputViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.null(),
    state: z.object({ configured: z.boolean(), disabled: z.boolean() }).strict()
  })
  .strict()
