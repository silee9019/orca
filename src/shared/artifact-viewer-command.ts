import { ArtifactDeleteConfirmationSchema } from './artifact-delete-viewer-command'
import { z } from 'zod'
import { ArtifactPublishViewerRequestSchema } from './artifact-publish-viewer-command'
import { isClipboardTextByteLengthOverLimit } from './clipboard-text'
import { ARTIFACT_LIST_SEARCH_QUERY_MAX_BYTES } from './artifact-list-search'

export const ArtifactViewerActionSchema = z.discriminatedUnion('kind', [
  ArtifactDeleteConfirmationSchema,
  z.strictObject({
    kind: z.literal('delete'),
    slug: z.string().min(1).max(512),
    reviewedTarget: z.uuid(),
    reviewedLink: z.string().min(1).max(8192)
  }),
  ArtifactPublishViewerRequestSchema.extend({ kind: z.literal('publish-form') }),
  z.object({ kind: z.literal('get') }).strict(),
  z.strictObject({ kind: z.literal('connect') }),
  z.strictObject({ kind: z.literal('open-account-settings') }),
  z.strictObject({ kind: z.literal('open-artifacts-settings') }),
  ...(['copy-link', 'open-link'] as const).map((kind) =>
    z.strictObject({
      kind: z.literal(kind),
      slug: z.string().min(1).max(512),
      reviewedTarget: z.uuid(),
      reviewedLink: z.string().min(1).max(8192)
    })
  ),
  z
    .object({
      kind: z.literal('query'),
      value: z
        .string()
        .refine(
          (value) =>
            !isClipboardTextByteLengthOverLimit(value, ARTIFACT_LIST_SEARCH_QUERY_MAX_BYTES)
        )
    })
    .strict(),
  z.object({ kind: z.literal('select'), slug: z.string().min(1).max(512).nullable() }).strict(),
  z.object({ kind: z.literal('refresh') }).strict(),
  z.object({ kind: z.literal('load-more') }).strict()
])
export type ArtifactViewerAction = z.infer<typeof ArtifactViewerActionSchema>
export const ArtifactViewerParams = z
  .object({
    viewer: z.literal('desktop'),
    action: ArtifactViewerActionSchema
  })
  .strict()
