import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
export const NetworkProxyViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      operation: z.enum([
        'network-proxy.get',
        'network-proxy.url-commit',
        'network-proxy.bypass-commit'
      ])
    })
    .strict(),
  z
    .object({ ...viewer, operation: z.literal('network-proxy.disclosure'), open: z.boolean() })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum(['network-proxy.url-draft', 'network-proxy.bypass-draft']),
      value: z.string().max(65536)
    })
    .strict()
])
export const NetworkProxyViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    state: z
      .object({
        open: z.boolean(),
        forcedOpen: z.boolean(),
        urlDraftSet: z.boolean(),
        bypassDraftSet: z.boolean(),
        urlInvalid: z.boolean()
      })
      .strict()
  })
  .strict()
export type NetworkProxyViewerState = z.infer<typeof NetworkProxyViewerResultSchema>['state']
export type NetworkProxyViewerResult = z.infer<typeof NetworkProxyViewerResultSchema>
