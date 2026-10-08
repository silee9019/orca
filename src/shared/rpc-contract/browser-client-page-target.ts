import { z } from 'zod'
export const BrowserClientPageTarget = z.object({
  remotePageId: z.string().min(1),
  browserHostClientId: z.string().min(1),
  browserHostGeneration: z.number().int().nonnegative(),
  pageHostGeneration: z.number().int().nonnegative()
})
export type BrowserClientPageTarget = z.infer<typeof BrowserClientPageTarget>
