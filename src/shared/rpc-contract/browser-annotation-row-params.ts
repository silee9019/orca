import { z } from 'zod'
import { GRAB_BUDGET } from '../browser-grab-types'
export const BrowserAnnotationRowIntent = z.enum(['fix', 'change', 'question', 'approve'])
export const BrowserAnnotationRowCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), annotationId: z.string().min(1) }),
  z.object({
    action: z.literal('comment'),
    value: z.string().max(GRAB_BUDGET.annotationCommentMaxLength)
  }),
  z.object({ action: z.literal('intent'), value: z.enum(['change', 'question']) }),
  z.object({ action: z.literal('save') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('status') })
])
export type BrowserAnnotationRowCommand = z.infer<typeof BrowserAnnotationRowCommand>
export const BrowserAnnotationRowState = z.object({
  editingAnnotationId: z.string().nullable(),
  comment: z.string().max(GRAB_BUDGET.annotationCommentMaxLength),
  intent: BrowserAnnotationRowIntent,
  savedAnnotationId: z.string().optional()
})
export type BrowserAnnotationRowState = z.infer<typeof BrowserAnnotationRowState>
