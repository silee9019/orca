import { z } from 'zod'

const id = z.string().min(1).max(1024)
export const ResourceViewerActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('set-open'), open: z.boolean() }).strict(),
  z.object({ action: z.literal('set-sort'), sort: z.enum(['cpu', 'memory', 'name']) }).strict(),
  z.object({ action: z.literal('set-app-collapsed'), collapsed: z.boolean() }).strict(),
  z.object({ action: z.literal('toggle-repo'), repoId: id }).strict(),
  z.object({ action: z.literal('toggle-worktree'), worktreeId: id }).strict(),
  z.object({ action: z.literal('navigate-worktree'), worktreeId: id }).strict(),
  z.object({ action: z.literal('navigate-session'), sessionId: id }).strict(),
  z
    .object({ action: z.literal('delete-worktree'), worktreeId: id, confirm: z.literal(true) })
    .strict(),
  z.object({ action: z.literal('open-cleanup') }).strict(),
  z.object({ action: z.literal('open-space') }).strict(),
  z
    .object({
      action: z.literal('prepare-kill'),
      sessionId: id,
      pid: z.number().int().nonnegative()
    })
    .strict(),
  z.object({ action: z.literal('cancel-kill') }).strict(),
  z.object({ action: z.literal('dismiss-kill') }).strict(),
  z
    .object({
      action: z.literal('confirm-kill'),
      sessionId: id,
      pid: z.number().int().nonnegative(),
      confirm: z.literal(true)
    })
    .strict(),
  z
    .object({
      action: z.literal('kill-orphans'),
      expectedSessionIds: z.array(id).max(4096),
      confirm: z.literal(true)
    })
    .strict(),
  z.object({ action: z.literal('prepare-daemon'), kind: z.enum(['restart', 'killAll']) }).strict(),
  z.object({ action: z.literal('cancel-daemon') }).strict(),
  z
    .object({
      action: z.literal('confirm-daemon'),
      kind: z.enum(['restart', 'killAll']),
      expectedSurfaceIds: z.array(id).max(4096),
      confirm: z.literal(true)
    })
    .strict()
])
export type ResourceViewerAction = z.infer<typeof ResourceViewerActionSchema>
