import { z } from 'zod'
export const BrowserViewportPanDelta = z.object({
  deltaX: z.number().finite().min(-100000).max(100000),
  deltaY: z.number().finite().min(-100000).max(100000)
})
export type BrowserViewportPanDelta = z.infer<typeof BrowserViewportPanDelta>
const position = z.object({
  scrollLeft: z.number().finite().nonnegative(),
  scrollTop: z.number().finite().nonnegative(),
  maxScrollLeft: z.number().finite().nonnegative(),
  maxScrollTop: z.number().finite().nonnegative()
})
export const BrowserViewportPanReceipt = z
  .object({
    page: z.string().min(1),
    delta: BrowserViewportPanDelta,
    before: position,
    after: position,
    accepted: z.literal(true)
  })
  .refine(
    ({ delta, before, after }) =>
      Math.abs(
        after.scrollLeft -
          Math.max(0, Math.min(before.maxScrollLeft, before.scrollLeft + delta.deltaX))
      ) <= 1 &&
      Math.abs(
        after.scrollTop -
          Math.max(0, Math.min(before.maxScrollTop, before.scrollTop + delta.deltaY))
      ) <= 1,
    { message: 'Panel position did not acknowledge the requested delta' }
  )
export type BrowserViewportPanReceipt = z.infer<typeof BrowserViewportPanReceipt>
