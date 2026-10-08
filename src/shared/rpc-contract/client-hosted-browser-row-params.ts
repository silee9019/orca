import { z } from 'zod'
export const ClientHostedBrowserRowCommand = z.object({
  action: z.enum(['activate', 'close']),
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  groupId: z.string().min(1),
  expectedHostClientId: z.string().min(1)
})
export type ClientHostedBrowserRowCommand = z.infer<typeof ClientHostedBrowserRowCommand>
export const ClientHostedBrowserRowState = ClientHostedBrowserRowCommand.extend({
  applied: z.literal(true)
})
export type ClientHostedBrowserRowState = z.infer<typeof ClientHostedBrowserRowState>
