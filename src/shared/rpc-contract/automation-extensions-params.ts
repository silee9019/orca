import { z } from 'zod'
import { EXTERNAL_AUTOMATION_PROVIDERS } from '../external-automation-scope'

export const ExternalAutomationScopeParams = z.strictObject({
  owner: z.strictObject({
    authority: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('desktop') }),
      z.strictObject({
        kind: z.literal('runtime'),
        environmentId: z.string().min(1),
        pairingRevision: z.number().int().nonnegative()
      })
    ]),
    selector: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('self') }),
      z.strictObject({
        kind: z.literal('ssh'),
        targetId: z.string().min(1),
        targetGeneration: z.number().int().nonnegative()
      })
    ])
  }),
  provider: z.enum(EXTERNAL_AUTOMATION_PROVIDERS)
})
export const ExternalAutomationListParams = ExternalAutomationScopeParams.extend({
  refresh: z.boolean().optional()
})
export const ExternalAutomationRunsParams = ExternalAutomationScopeParams.extend({
  jobId: z.string().min(1),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100)
})
export const ExternalAutomationCreateParams = ExternalAutomationScopeParams.extend({
  name: z.string().min(1).max(512),
  prompt: z.string().min(1).max(65536),
  schedule: z.string().min(1).max(512),
  workdir: z.string().min(1).nullable()
})
export const ExternalAutomationUpdateParams = ExternalAutomationCreateParams.extend({
  jobId: z.string().min(1)
})
export const ExternalAutomationActionParams = ExternalAutomationScopeParams.extend({
  jobId: z.string().min(1),
  action: z.enum(['pause', 'resume', 'run', 'delete'])
})
export const AutomationRunPrecheckParams = z.strictObject({
  automationId: z.string().min(1),
  runId: z.string().min(1)
})
export const AutomationSnapshotNameParams = z.strictObject({
  workspaceId: z.string().min(1),
  displayName: z.string().max(512)
})
