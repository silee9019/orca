import { z } from 'zod'

export const TerminalStartupRestorationParams = z.object({ confirm: z.literal(true) }).strict()
