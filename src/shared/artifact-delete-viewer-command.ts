import { z } from 'zod'
export const ArtifactDeleteConfirmationSchema = z.strictObject({
  kind: z.literal('delete-confirmation'),
  slug: z.string().min(1).max(512),
  reviewedTarget: z.uuid(),
  confirmed: z.boolean()
})
export type ArtifactDeleteConfirmation = z.infer<typeof ArtifactDeleteConfirmationSchema>
