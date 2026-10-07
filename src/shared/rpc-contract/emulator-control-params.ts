import { z } from 'zod'

const coordinate = z.number().finite().min(0).max(1)
export const EmulatorControlEvent = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('key'),
      key: z.string().min(1).max(32),
      shift: z.boolean().optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('touch'),
      phase: z.enum(['begin', 'move', 'end', 'cancel']),
      x: coordinate,
      y: coordinate,
      edge: z.number().int().min(0).max(4).optional()
    })
    .strict(),
  z.object({ type: z.literal('wait'), ms: z.number().int().min(1).max(60000) }).strict(),
  z.object({ type: z.literal('blur') }).strict()
])
export type EmulatorControlEvent = z.infer<typeof EmulatorControlEvent>
export const EmulatorControlParams = z
  .object({
    worktree: z.string().min(1),
    events: z.array(EmulatorControlEvent).min(1).max(4096)
  })
  .strict()
  .refine(
    ({ events }) =>
      events.reduce(
        (sum, event) => sum + (event.type === 'wait' ? event.ms : event.type === 'key' ? 80 : 16),
        0
      ) <= 60000,
    'Control sequence must finish within 60000ms'
  )

export const EmulatorFocusParams = z.object({ worktree: z.string().min(1) }).strict()
