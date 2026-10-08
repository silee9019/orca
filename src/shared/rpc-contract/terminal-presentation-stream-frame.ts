import { z } from 'zod'

const Driver = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idle') }).strict(),
  z.object({ kind: z.literal('desktop') }).strict(),
  z.object({ kind: z.literal('mobile'), clientId: z.string().min(1) }).strict()
])
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const TerminalPresentationStreamFrame = z.union([
  z
    .object({ type: z.literal('ready'), kind: z.enum(['driver', 'fit']), sequence: z.literal(0) })
    .strict(),
  z
    .object({ type: z.literal('event'), kind: z.literal('driver'), sequence, value: Driver })
    .strict(),
  z
    .object({
      type: z.literal('event'),
      kind: z.literal('fit'),
      sequence,
      value: z
        .object({
          mode: z.enum(['mobile-fit', 'remote-desktop-fit', 'desktop-fit']),
          cols: z.number().nonnegative(),
          rows: z.number().nonnegative()
        })
        .strict()
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z
    .object({ type: z.literal('error'), code: z.literal('terminal_presentation_owner_changed') })
    .strict()
])
