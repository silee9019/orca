import { z } from 'zod'
export const SshHostRemovalViewerStateSchema = z
  .object({
    advancedOpen: z.boolean(),
    deleteWorkspaces: z.boolean(),
    workspaceCount: z.number().int().nonnegative(),
    isConnected: z.boolean(),
    busy: z.boolean()
  })
  .strict()
export type SshHostRemovalViewerState = z.infer<typeof SshHostRemovalViewerStateSchema>
export const SshWorkspaceRemovalViewerStateSchema = z
  .object({
    workspaceId: z.string().nullable(),
    confirmationKind: z.enum(['workspace', 'project', 'folder']).optional(),
    connected: z.boolean().optional(),
    selected: z.boolean().optional(),
    expectedHostId: z.string().nullable().optional(),
    targetId: z.string().nullable(),
    dialogOpen: z.boolean(),
    canReconnect: z.boolean(),
    busy: z.boolean()
  })
  .strict()
export type SshWorkspaceRemovalViewerState = z.infer<typeof SshWorkspaceRemovalViewerStateSchema>
export const SshConfirmationViewerStateSchema = z
  .object({
    removeTargetId: z.string().nullable().optional(),
    workspaceRemoval: z.boolean().optional(),
    workspaceForget: SshWorkspaceRemovalViewerStateSchema.optional(),
    workspaceDetails: SshHostRemovalViewerStateSchema.nullable().optional(),
    resetTargetId: z.string().nullable(),
    terminateTargetId: z.string().nullable(),
    busy: z.boolean()
  })
  .strict()
export type SshConfirmationViewerState = z.infer<typeof SshConfirmationViewerStateSchema>
export const SshConfirmationViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.null(),
    state: SshConfirmationViewerStateSchema,
    termination: z
      .object({
        terminated: z.number().int().nonnegative(),
        unverifiable: z.number().int().nonnegative()
      })
      .strict()
      .nullable(),
    reason: z.string().optional()
  })
  .strict()
export type SshConfirmationViewerResult = z.infer<typeof SshConfirmationViewerResultSchema>

export const SshWorkspaceRemovalViewerResultSchema = SshConfirmationViewerResultSchema.extend({
  state: SshConfirmationViewerStateSchema.extend({
    workspaceForget: SshWorkspaceRemovalViewerStateSchema
  })
})
