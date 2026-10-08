import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
export const RuntimeLinkViewerParams = z.discriminatedUnion('operation', [
  z.object({ ...viewer, operation: z.literal('runtime-link.get') }).strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime-link.generate'),
      address: z.string().min(1).max(65536),
      intent: z.enum(['another', 'local', 'custom'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime-link.copy'),
      target: z.enum(['web', 'pairing'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime-link.revoke'),
      deviceId: z.string().min(1).max(65536)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime-link.intent'),
      value: z.enum(['another', 'local', 'custom'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime-link.address'),
      value: z.string().max(65536)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime-link.refresh'),
      target: z.enum(['network', 'grants'])
    })
    .strict()
])
export const RuntimeLinkViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    state: z
      .object({
        formVisible: z.boolean(),
        intent: z.enum(['another', 'local', 'custom']),
        addressSet: z.boolean(),
        refreshing: z.boolean(),
        grantsLoading: z.boolean(),
        grantCount: z.number().int().nonnegative(),
        generating: z.boolean(),
        pairingAvailable: z.boolean(),
        webAvailable: z.boolean(),
        current: z.boolean(),
        copiedTarget: z.enum(['web', 'pairing']).nullable()
      })
      .strict()
  })
  .strict()
export type RuntimeLinkViewerState = z.infer<typeof RuntimeLinkViewerResultSchema>['state']
export type RuntimeLinkViewerResult = z.infer<typeof RuntimeLinkViewerResultSchema>
