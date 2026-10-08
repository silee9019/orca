import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
export const RuntimeServerViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      operation: z.enum([
        'runtime-server.get',
        'runtime-server.refresh',
        'runtime-server.remove-cancel'
      ])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum([
        'runtime-server.connect',
        'runtime-server.disconnect',
        'runtime-server.remove-open'
      ]),
      environmentId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime-server.remove-confirm'),
      confirmTarget: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime-server.add'),
      name: z.string().min(1),
      pairingCode: z.string().min(1).max(65536),
      allowLoopback: z.boolean()
    })
    .strict(),
  z
    .object({ ...viewer, operation: z.literal('runtime-server.updates'), open: z.boolean() })
    .strict()
])
export const RuntimeServerViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    state: z
      .object({
        visible: z.boolean(),
        busy: z.boolean(),
        addFormOpen: z.boolean(),
        pendingRemoveId: z.string().nullable(),
        removeErrorSet: z.boolean(),
        updatesOpen: z.boolean(),
        environmentCount: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict()
export type RuntimeServerViewerState = z.infer<typeof RuntimeServerViewerResultSchema>['state']
export type RuntimeServerViewerResult = z.infer<typeof RuntimeServerViewerResultSchema>
