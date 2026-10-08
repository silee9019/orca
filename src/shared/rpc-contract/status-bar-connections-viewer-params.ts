import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
const runtime = { ...viewer, environmentId: z.string().min(1), expectedHostId: z.string().min(1) }
export const StatusBarConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({ ...viewer, operation: z.literal('status-bar.disclosure'), open: z.boolean() })
    .strict(),
  z.object({ ...viewer, operation: z.literal('status-bar.manage') }).strict(),
  z.object({ ...runtime, operation: z.literal('status-bar.runtime-connect') }).strict(),
  z
    .object({
      ...runtime,
      operation: z.literal('status-bar.runtime-disconnect'),
      confirmTarget: z.string().min(1)
    })
    .strict(),
  z
    .object({ ...viewer, operation: z.literal('status-bar.ssh-visible'), value: z.boolean() })
    .strict()
])
export type StatusBarConnectionsViewerCommand = z.infer<typeof StatusBarConnectionsViewerParams>
