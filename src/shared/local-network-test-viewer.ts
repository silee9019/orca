import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
export const LocalNetworkTestViewerParams = z.discriminatedUnion('operation', [
  z.object({ ...viewer, operation: z.literal('local-network-test.get') }).strict(),
  z
    .object({ ...viewer, operation: z.literal('local-network-test.disclosure'), open: z.boolean() })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum(['local-network-test.host', 'local-network-test.port']),
      value: z.string().max(65536)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('local-network-test.submit'),
      host: z.string().min(1).max(65536),
      port: z.number().int().min(1).max(65535)
    })
    .strict()
])
export const LocalNetworkTestViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    state: z
      .object({
        open: z.boolean(),
        running: z.boolean(),
        hostSet: z.boolean(),
        portSet: z.boolean(),
        hasSuccess: z.boolean(),
        failure: z
          .enum([
            'invalid-target',
            'timeout',
            'refused',
            'unreachable',
            'unresolved',
            'failed',
            'unsupported'
          ])
          .nullable()
      })
      .strict()
  })
  .strict()
export type LocalNetworkTestViewerState = z.infer<
  typeof LocalNetworkTestViewerResultSchema
>['state']
export type LocalNetworkTestViewerResult = z.infer<typeof LocalNetworkTestViewerResultSchema>
