import { z } from 'zod'
export const LocalNetworkConnectionTestParams = z
  .object({ host: z.string().min(1).max(253), port: z.number().int().min(1).max(65535) })
  .strict()
