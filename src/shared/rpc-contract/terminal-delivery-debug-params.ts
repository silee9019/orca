import { z } from 'zod'

export const TerminalDeliveryDebugReadParams = z.object({}).strict()
export const TerminalDeliveryDebugResetParams = z.object({ confirm: z.literal(true) }).strict()
