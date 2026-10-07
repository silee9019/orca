import { z } from 'zod'
const target = {
  surface: z.enum(['modal', 'settings']),
  runtime: z.literal('local'),
  workspaceId: z.string().min(1).nullable()
}
export const BrowserSetupGuideCommand = z.discriminatedUnion('action', [
  z.object({ ...target, action: z.literal('status') }),
  z.object({
    ...target,
    action: z.literal('prepare-install'),
    confirm: z.literal('browser-use-setup')
  })
])
export type BrowserSetupGuideCommand = z.infer<typeof BrowserSetupGuideCommand>
export const BrowserSetupGuideState = z.object({
  busy: z.boolean(),
  commandPrepared: z.boolean(),
  clipboardCopied: z.boolean().optional(),
  warningPresent: z.boolean().optional(),
  browserUseEnabled: z.boolean(),
  orchestrationEnabled: z.boolean(),
  interactionRecorded: z.boolean()
})
export type BrowserSetupGuideState = z.infer<typeof BrowserSetupGuideState>
