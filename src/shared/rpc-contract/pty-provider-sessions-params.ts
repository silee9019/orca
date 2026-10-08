import { z } from 'zod'

export const PtyProviderSessionsParams = z.union([
  z
    .object({
      connectionId: z
        .string()
        .min(1)
        .max(512)
        .refine((value) => value.trim().length > 0)
        .nullable()
    })
    .strict(),
  z.object({ diagnostic: z.literal(true) }).strict()
])
