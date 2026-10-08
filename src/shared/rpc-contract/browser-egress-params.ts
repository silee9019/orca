import { z } from 'zod'
import { BrowserClientPageTarget } from './browser-client-page-target'
export const BrowserEgressTarget = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ssh'),
    executionHostId: z.string().regex(/^ssh:.+/),
    egress: z.enum(['ssh', 'local'])
  }),
  z.object({
    kind: z.literal('client'),
    environmentId: z.string().min(1),
    clientTarget: BrowserClientPageTarget
  }),
  z.object({
    kind: z.literal('streamed'),
    environmentId: z.string().min(1),
    remotePageId: z.string().min(1)
  })
])
export type BrowserEgressTarget = z.infer<typeof BrowserEgressTarget>
export const BrowserEgressCommand = z.object({
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  target: BrowserEgressTarget,
  action: z.enum(['open', 'close', 'settings', 'status'])
})
export type BrowserEgressCommand = z.infer<typeof BrowserEgressCommand>
export const BrowserEgressState = z.object({
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  open: z.boolean(),
  settingsOpened: z.boolean()
})
export type BrowserEgressState = z.infer<typeof BrowserEgressState>
