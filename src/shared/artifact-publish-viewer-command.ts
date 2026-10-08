import { z } from 'zod'
export const ArtifactPublishViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('open-settings') }),
  z.strictObject({ kind: z.literal('connect') }),
  z.strictObject({ kind: z.literal('focus-content') }),
  z.strictObject({ kind: z.literal('focus-anchor') }),
  z.strictObject({ kind: z.literal('open'), value: z.boolean() }),
  z.strictObject({ kind: z.literal('retry') }),
  z.strictObject({ kind: z.literal('publish'), reviewedTarget: z.uuid() }),
  ...(['copy-link', 'open-link', 'update-link'] as const).map((kind) =>
    z.strictObject({
      kind: z.literal(kind),
      reviewedTarget: z.uuid(),
      reviewedLink: z.string().min(1).max(8192)
    })
  )
])
export const ArtifactPublishViewerRequestSchema = z.strictObject({
  sourceKey: z.string().min(1).max(4096),
  action: ArtifactPublishViewerActionSchema
})
export type ArtifactPublishViewerRequest = z.infer<typeof ArtifactPublishViewerRequestSchema>
