import { z } from 'zod'

const reviewedTarget = z.uuid()
export const SkillInstallWorkspaceViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('open'), reviewedTarget, value: z.boolean() }).strict(),
  z.object({ kind: z.literal('query'), reviewedTarget, value: z.string().max(8192) }).strict(),
  z
    .object({ kind: z.literal('highlight'), reviewedTarget, id: z.string().min(1).max(8192) })
    .strict(),
  z.object({ kind: z.literal('choose'), reviewedTarget, id: z.string().min(1).max(8192) }).strict(),
  z.object({ kind: z.literal('focus'), reviewedTarget }).strict(),
  z
    .object({
      kind: z.literal('trigger-key'),
      reviewedTarget,
      key: z
        .string()
        .refine(
          (key) => key === 'ArrowDown' || key === 'ArrowUp' || (key.length === 1 && /\S/.test(key))
        )
    })
    .strict()
])
export type SkillInstallWorkspaceViewerAction = z.infer<
  typeof SkillInstallWorkspaceViewerActionSchema
>
