import { z } from 'zod'
import { isClipboardTextByteLengthOverLimit } from './clipboard-text'

const review = { reviewedTarget: z.string().uuid() }
const repoId = z.string().min(1).max(4096)
const projectKey = z.string().min(1).max(8192)
export const AutomationProjectViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('open'), ...review, value: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('query'),
      ...review,
      value: z.string().refine((query) => !isClipboardTextByteLengthOverLimit(query, 2 * 1024))
    })
    .strict(),
  z.object({ kind: z.literal('command'), ...review, repoId: repoId.or(z.literal('')) }).strict(),
  z.object({ kind: z.literal('select'), ...review, repoId }).strict(),
  z.object({ kind: z.literal('host-menu'), ...review, projectKey: projectKey.nullable() }).strict(),
  z
    .object({
      kind: z.literal('host-hover'),
      ...review,
      projectKey,
      region: z.enum(['row', 'content']),
      hovered: z.boolean()
    })
    .strict(),
  z.object({ kind: z.literal('focus'), ...review }).strict(),
  z.object({ kind: z.literal('add'), ...review, path: z.string().min(1).max(32768) }).strict()
])
export type AutomationProjectViewerAction = z.infer<typeof AutomationProjectViewerActionSchema>
