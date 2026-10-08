import { z } from 'zod'
export const PairingSetupConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({ viewerId: z.number().int().positive(), operation: z.literal('pairing-setup.get') })
    .strict(),
  z
    .object({
      viewerId: z.number().int().positive(),
      operation: z.literal('pairing-setup.disclosure'),
      open: z.boolean()
    })
    .strict()
])
