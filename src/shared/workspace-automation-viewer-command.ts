import { z } from 'zod'
const target = { sectionKey: z.string().min(1).max(256), reviewedTarget: z.uuid() }
export const WorkspaceAutomationViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('open-automation'), ...target }),
  z.strictObject({ kind: z.literal('open-run'), ...target })
])
export type WorkspaceAutomationViewerAction = z.infer<typeof WorkspaceAutomationViewerActionSchema>
export type WorkspaceAutomationNavigationTarget = { workspaceId: string; hostId?: string }
