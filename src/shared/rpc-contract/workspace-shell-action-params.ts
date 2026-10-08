import { z } from 'zod'
import { isWindowsAbsolutePathLike } from '../cross-platform-path'

export const DesktopShellReveal = z
  .object({
    path: z
      .string()
      .min(1)
      .refine(
        (value) => value.startsWith('/') || isWindowsAbsolutePathLike(value),
        'Use an absolute desktop path.'
      ),
    expectedExecutionHostId: z.literal('local')
  })
  .strict()

export const DesktopShellOpenEditor = DesktopShellReveal.extend({
  command: z.string().optional(),
  connectionId: z.string().min(1).optional()
}).strict()
