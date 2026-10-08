import { z } from 'zod'
export const StatusBarConnectionsViewerState = z
  .object({
    open: z.boolean().optional(),
    settingsOpen: z.boolean().optional(),
    sshVisible: z.boolean().optional(),
    environmentId: z.string().optional(),
    connected: z.boolean().optional(),
    runtimeState: z
      .enum([
        'connected',
        'disconnected',
        'runtime-unavailable',
        'workspace-window-closed',
        'checking',
        'reconnecting'
      ])
      .optional()
  })
  .strict()
export const StatusBarConnectionsViewerResult = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    state: z.object({ statusBar: StatusBarConnectionsViewerState }).strict(),
    reason: z.string().optional()
  })
  .strict()
export type StatusBarConnectionsViewerState = z.infer<typeof StatusBarConnectionsViewerState>
export type StatusBarConnectionsViewerResult = z.infer<typeof StatusBarConnectionsViewerResult>
