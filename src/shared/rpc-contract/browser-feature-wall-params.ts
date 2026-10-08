import { z } from 'zod'
export const BrowserFeatureWallCommand = z.object({
  action: z.enum(['status', 'recheck', 'install-intent']),
  workspaceId: z.string().min(1).nullable(),
  runtime: z.literal('local')
})
export type BrowserFeatureWallCommand = z.infer<typeof BrowserFeatureWallCommand>
export const BrowserFeatureWallState = z.object({
  installed: z.boolean(),
  loading: z.boolean(),
  settled: z.boolean(),
  unverifiable: z.boolean(),
  browserUseEnabled: z.boolean(),
  interactionRecorded: z.boolean()
})
export type BrowserFeatureWallState = z.infer<typeof BrowserFeatureWallState>
