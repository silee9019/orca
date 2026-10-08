import { z } from 'zod'

export const AgentPermissionModeParams = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('set'), mode: z.enum(['yolo', 'manual']) }).strict()
])
export type AgentPermissionModeOperation = z.infer<typeof AgentPermissionModeParams>
