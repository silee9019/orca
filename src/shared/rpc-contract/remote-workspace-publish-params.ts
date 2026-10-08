import { z } from 'zod'

export const RemoteWorkspacePublishParams = z
  .object({
    targets: z
      .array(
        z
          .object({
            targetId: z.string().min(1).max(256),
            expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            hostObservationToken: z.string().min(1).max(128)
          })
          .strict()
      )
      .min(1)
      .max(128)
      .refine(
        (targets) => new Set(targets.map((target) => target.targetId)).size === targets.length
      ),
    session: z.unknown().optional(),
    confirm: z.literal(true)
  })
  .strict()
export type RemoteWorkspacePublishRequest = z.output<typeof RemoteWorkspacePublishParams>
