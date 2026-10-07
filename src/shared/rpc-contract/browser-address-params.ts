import { z } from 'zod'
export const BrowserAddressCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('draft'), text: z.string().max(2048) }),
  z.object({
    action: z.enum(['preview', 'select', 'highlight']),
    index: z.number().int().nonnegative()
  }),
  z.object({ action: z.enum(['open', 'dismiss', 'submit', 'status', 'next', 'previous']) })
])
export type BrowserAddressCommand = z.infer<typeof BrowserAddressCommand>
export const BrowserAddressState = z.object({
  value: z.string(),
  open: z.boolean(),
  focused: z.boolean(),
  selectedIndex: z.number().int(),
  suggestions: z.array(
    z.object({
      index: z.number().int(),
      url: z.string(),
      title: z.string(),
      kind: z.enum(['workspace-doc', 'search', 'history'])
    })
  ),
  navigationRequested: z.literal(true).optional()
})
export type BrowserAddressState = z.infer<typeof BrowserAddressState>
