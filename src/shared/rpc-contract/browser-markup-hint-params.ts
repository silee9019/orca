import { z } from 'zod'
export const BrowserMarkupHintAction = z.enum(['toggle', 'dismiss', 'status'])
export type BrowserMarkupHintAction = z.infer<typeof BrowserMarkupHintAction>
export const BrowserMarkupHintState = z.object({
  page: z.string().min(1),
  action: BrowserMarkupHintAction,
  hintOpen: z.boolean(),
  active: z.boolean(),
  disabled: z.boolean(),
  accepted: z.literal(true)
})
export type BrowserMarkupHintState = z.infer<typeof BrowserMarkupHintState>
