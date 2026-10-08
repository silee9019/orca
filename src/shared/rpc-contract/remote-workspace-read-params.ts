import { z } from 'zod'

export const RemoteWorkspaceReadParams = z.object({ targetId: z.string().trim().min(1) }).strict()
export const RemoteWorkspaceClientsParams = z
  .object({ targetIds: z.array(z.string().trim().min(1)).optional() })
  .strict()
export const RemoteWorkspaceInventoryParams = z.object({}).strict()
