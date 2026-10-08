import { z } from 'zod'
export const AgentSkillSetupViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({
    kind: z.literal('open-terminal'),
    panelKey: z.string().min(1).max(1024),
    reviewedTarget: z.uuid()
  }),
  z.strictObject({
    kind: z.literal('copy-command'),
    panelKey: z.string().min(1).max(1024),
    reviewedTarget: z.uuid()
  }),
  z.strictObject({
    kind: z.literal('recheck'),
    panelKey: z.string().min(1).max(1024),
    reviewedTarget: z.uuid()
  })
])
export type AgentSkillSetupViewerAction = z.infer<typeof AgentSkillSetupViewerActionSchema>
