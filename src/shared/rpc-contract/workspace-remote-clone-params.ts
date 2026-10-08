import { z } from 'zod'
const Desktop = z.object({ expectedExecutionHostId: z.literal('local') })
export const DesktopRemoteCloneStart = Desktop.extend({
  expectedCloneHostId: z
    .string()
    .regex(/^ssh:[^\s]+$/)
    .max(512),
  url: z.string().trim().min(1).max(8192),
  destination: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .refine((value) => !value.startsWith('~'), {
      message: 'An absolute selected-host destination is required.'
    })
}).strict()
export const DesktopRemoteCloneRequest = Desktop.extend({ requestId: z.string().uuid() }).strict()
export function getDesktopRemoteCloneConfirmation(
  params: z.infer<typeof DesktopRemoteCloneStart>
): string {
  return `${params.expectedCloneHostId}:${params.destination}`
}
