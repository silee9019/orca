import { z } from 'zod'
import { isWslUncPath } from '../wsl-paths'
import { DesktopRemoteCloneRequest } from './workspace-remote-clone-params'
export const DesktopLocalCloneStart = z
  .object({
    expectedExecutionHostId: z.literal('local'),
    expectedCloneHostId: z.literal('local'),
    url: z.string().trim().min(1).max(8192),
    destination: z
      .string()
      .trim()
      .min(1)
      .max(4096)
      .refine((path) => !isWslUncPath(path), {
        message: 'An explicitly supported native destination is required.'
      })
  })
  .strict()
export const DesktopLocalCloneRequest = DesktopRemoteCloneRequest
export function getDesktopLocalCloneConfirmation(
  params: z.infer<typeof DesktopLocalCloneStart>
): string {
  return `${params.expectedCloneHostId}:${params.destination}`
}
