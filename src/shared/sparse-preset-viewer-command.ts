import { isClipboardTextByteLengthOverLimit } from './clipboard-text'
import { z } from 'zod'
const review = { reviewedTarget: z.uuid() }
const id = z.string().min(1).max(4096)
export const SparsePresetViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({
    kind: z.literal('chooser-query'),
    ...review,
    value: z.string().refine((value) => !isClipboardTextByteLengthOverLimit(value, 2 * 1024))
  }),
  z.strictObject({ kind: z.literal('chooser-command'), ...review, value: z.string().max(8192) }),
  z.strictObject({ kind: z.literal('delete-request'), ...review, presetId: id }),
  z.strictObject({ kind: z.literal('delete-confirm'), ...review, presetId: id }),
  z.strictObject({ kind: z.literal('delete-cancel'), ...review, presetId: id }),
  z.strictObject({ kind: z.literal('name-touch'), ...review }),
  z.strictObject({
    kind: z.literal('directories-add'),
    ...review,
    directories: z.array(z.string().min(1).max(4096)).min(1).max(2048)
  }),
  z.strictObject({
    kind: z.literal('directory-remove'),
    ...review,
    directory: z.string().min(1).max(4096)
  }),
  z.strictObject({ kind: z.literal('open'), ...review, value: z.boolean() }),
  z.strictObject({ kind: z.literal('select'), ...review, presetId: id }),
  z.strictObject({ kind: z.literal('edit'), ...review, presetId: id }),
  z.strictObject({ kind: z.literal('new'), ...review }),
  z.strictObject({ kind: z.literal('off'), ...review }),
  z.strictObject({ kind: z.literal('cancel'), ...review }),
  z.strictObject({ kind: z.literal('retry'), ...review }),
  z.strictObject({ kind: z.literal('save'), ...review }),
  z.strictObject({
    kind: z.literal('draft'),
    ...review,
    name: z.string().max(512),
    directoriesText: z.string().max(65536)
  })
])
export const SparsePresetViewerRequestSchema = z.strictObject({
  repoId: id,
  surface: z.enum(['selector', 'settings']).optional(),
  action: SparsePresetViewerActionSchema
})
export const SparsePresetViewerParams = SparsePresetViewerRequestSchema.extend({
  viewer: z.literal('desktop')
})
export type SparsePresetViewerAction = z.infer<typeof SparsePresetViewerActionSchema>
export type SparsePresetViewerRequest = z.infer<typeof SparsePresetViewerRequestSchema>
