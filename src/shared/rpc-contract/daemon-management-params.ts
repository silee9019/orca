import { z } from 'zod'

export const DaemonManagementListParams = z.object({}).strict()
export const DaemonManagementStopParams = z
  .object({
    sessionId: z.string().min(1).max(512),
    incarnationId: z.string().min(1).max(512),
    protocolVersion: z.number().int().positive(),
    confirm: z.literal(true)
  })
  .strict()
export const DaemonManagementStopManyParams = z
  .object({ targets: z.array(DaemonManagementStopParams).min(1).max(256) })
  .strict()
