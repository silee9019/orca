import { z } from 'zod'

export const ProfileAuthControlParams = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['start', 'status', 'cancel', 'refresh']) }).strict(),
  z.object({ action: z.literal('sign-out'), confirm: z.literal(true) }).strict(),
  z.object({ action: z.literal('select-org'), orgId: z.string().trim().min(1) }).strict()
])
export type ProfileAuthControlOperation = z.infer<typeof ProfileAuthControlParams>
