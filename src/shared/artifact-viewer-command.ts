import { z } from 'zod'
import { isClipboardTextByteLengthOverLimit } from './clipboard-text'
import { ARTIFACT_LIST_SEARCH_QUERY_MAX_BYTES } from './artifact-list-search'

export const ArtifactViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
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
