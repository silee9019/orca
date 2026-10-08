import { z } from 'zod'
const target = { viewerId: z.number().int().positive(), targetId: z.string().min(1) }
export const SshPortsFormDraftSchema = z
  .object({
    remotePort: z.string().max(64).optional(),
    localPort: z.string().max(64).optional(),
    remoteHost: z.string().max(65536).optional(),
    label: z.string().max(65536).optional()
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => typeof field === 'string'))
export type SshPortsFormDraft = z.infer<typeof SshPortsFormDraftSchema>
export const SshPortsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({ ...target, operation: z.literal('ssh-ports.draft'), draft: SshPortsFormDraftSchema })
    .strict(),
  z
    .object({ ...target, operation: z.literal('ssh-ports.save'), confirmTarget: z.string().min(1) })
    .strict(),
  z.object({ ...target, operation: z.enum(['ssh-ports.get', 'ssh-ports.cancel']) }).strict(),
  z
    .object({ ...target, operation: z.literal('ssh-ports.copy'), forwardId: z.string().min(1) })
    .strict(),
  z
    .object({
      ...target,
      operation: z.literal('ssh-ports.remove'),
      forwardId: z.string().min(1),
      confirmTarget: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...target,
      operation: z.literal('ssh-ports.open-browser'),
      forwardId: z.string().min(1),
      destination: z.enum(['configured', 'system', 'orca']).optional()
    })
    .strict(),
  z
    .object({ ...target, operation: z.literal('ssh-ports.edit'), forwardId: z.string().min(1) })
    .strict(),
  z
    .object({
      ...target,
      operation: z.literal('ssh-ports.detected'),
      remoteHost: z.string().min(1).max(65536),
      remotePort: z.number().int().min(1).max(65535)
    })
    .strict()
])
export const SshPortsViewerStateSchema = z
  .object({
    connectionId: z.string().nullable(),
    disconnected: z.boolean(),
    forwardCount: z.number().int().nonnegative(),
    detectedCount: z.number().int().nonnegative(),
    dialog: z.enum(['closed', 'add', 'edit']),
    dialogTargetId: z.string().nullable(),
    editingForwardId: z.string().nullable()
  })
  .strict()
export const SshPortsViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    state: SshPortsViewerStateSchema
  })
  .strict()
export type SshPortsViewerState = z.infer<typeof SshPortsViewerStateSchema>
export type SshPortsViewerResult = z.infer<typeof SshPortsViewerResultSchema>
