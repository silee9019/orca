import { z } from 'zod'
export const BrowserTakeBackCommand = z.object({
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  expectedMobileClientId: z.string().min(1)
})
export type BrowserTakeBackCommand = z.infer<typeof BrowserTakeBackCommand>
export const BrowserTakeBackState = BrowserTakeBackCommand.extend({
  workspaceId: z.string().min(1),
  driver: z.literal('desktop'),
  reclaimed: z.literal(true)
})
export type BrowserTakeBackState = z.infer<typeof BrowserTakeBackState>
