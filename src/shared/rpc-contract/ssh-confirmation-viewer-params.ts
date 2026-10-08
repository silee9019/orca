import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
export const SshConfirmationConnectionsViewerParams = z.discriminatedUnion('operation', [
  z.object({ ...viewer, operation: z.literal('ssh-confirmation.get') }).strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('ssh-confirmation.request'),
      kind: z.enum(['reset', 'terminate', 'remove']),
      targetId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('ssh-confirmation.remove-options'),
      confirmTarget: z.string().min(1),
      advancedOpen: z.boolean(),
      deleteWorkspaces: z.boolean()
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('ssh-confirmation.confirm'),
      kind: z.enum(['reset', 'terminate', 'remove']),
      confirmTarget: z.string().min(1),
      workspaceDisposition: z.enum(['keep', 'delete-remote', 'forget-local']).optional()
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('ssh-confirmation.cancel'),
      kind: z.enum(['reset', 'terminate', 'remove'])
    })
    .strict()
])

const hostViewer = {
  ...viewer,
  surface: z.enum(['status-row', 'host-menu', 'worktree-card', 'target-row']),
  targetId: z.string().min(1),
  expectedHostId: z.string().min(1),
  workspaceId: z.string().min(1).optional()
}
export const SshHostConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...hostViewer,
      operation: z.literal('ssh-workspace.host-connect')
    })
    .strict(),
  z.object({ ...hostViewer, operation: z.literal('ssh-workspace.host-select') }).strict(),
  z
    .object({
      ...hostViewer,
      operation: z.literal('ssh-workspace.host-disconnect'),
      confirmTarget: z.string().min(1)
    })
    .strict()
])
export type SshHostViewerCommand = z.infer<typeof SshHostConnectionsViewerParams>
export const SshWorkspaceConnectionsViewerParams = z.discriminatedUnion('operation', [
  ...SshHostConnectionsViewerParams.options,
  z
    .object({
      ...viewer,
      operation: z.enum(['ssh-workspace.connect', 'ssh-workspace.request']),
      workspaceId: z.string().min(1),
      targetId: z.string().min(1),
      expectedHostId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum(['ssh-workspace.get', 'ssh-workspace.cancel']),
      workspaceId: z.string().min(1),
      targetId: z.string().min(1),
      expectedHostId: z.string().min(1).optional()
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum(['ssh-workspace.forget-local', 'ssh-workspace.reconnect-delete']),
      workspaceId: z.string().min(1),
      targetId: z.string().min(1),
      confirmTarget: z.string().min(1),
      expectedHostId: z.string().min(1).optional()
    })
    .strict()
])
