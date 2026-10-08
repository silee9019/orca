import { AutomationSetupViewerActionSchema } from './automation-setup-viewer-command'
import { isTuiAgent } from './tui-agent-config'
import { AutomationWorkspaceViewerActionSchema } from './automation-workspace-viewer-command'
import { AutomationTimeViewerActionSchema } from './automation-time-viewer-command'
import { z } from 'zod'

export const AutomationEditorViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z
    .object({
      kind: z.literal('project'),
      reviewedTarget: z.uuid(),
      projectId: z.string().min(1).max(4096)
    })
    .strict(),
  z
    .object({
      kind: z.literal('setup-form'),
      reviewedTarget: z.uuid(),
      action: AutomationSetupViewerActionSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal('agent'),
      reviewedTarget: z.uuid(),
      value: z.string().min(1).max(256).refine(isTuiAgent, 'Unknown provider')
    })
    .strict(),
  z
    .object({
      kind: z.literal('workspace-form'),
      reviewedTarget: z.uuid(),
      action: AutomationWorkspaceViewerActionSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal('time-form'),
      reviewedTarget: z.uuid(),
      action: AutomationTimeViewerActionSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule-preset'),
      reviewedTarget: z.uuid(),
      value: z.enum(['hourly', 'daily', 'weekdays', 'weekly', 'custom'])
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule-weekday'),
      reviewedTarget: z.uuid(),
      value: z.enum(['0', '1', '2', '3', '4', '5', '6'])
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule-cron'),
      reviewedTarget: z.uuid(),
      value: z.string().max(4096)
    })
    .strict(),
  z
    .object({
      kind: z.literal('session'),
      reviewedTarget: z.uuid(),
      value: z.enum(['fresh', 'reuse'])
    })
    .strict(),
  z
    .object({
      kind: z.literal('missed-run-grace'),
      reviewedTarget: z.uuid(),
      value: z.enum(['0', '30', '60', '180', '720', '1440', '2880'])
    })
    .strict(),
  z
    .object({
      kind: z.literal('precheck-command'),
      reviewedTarget: z.uuid(),
      value: z.string().max(100_000)
    })
    .strict(),
  z
    .object({
      kind: z.literal('precheck-timeout'),
      reviewedTarget: z.uuid(),
      value: z.enum(['30', '60', '120', '300', '600'])
    })
    .strict(),
  z
    .object({ kind: z.literal('template-open'), reviewedTarget: z.uuid(), value: z.boolean() })
    .strict(),
  z
    .object({
      kind: z.literal('template-apply'),
      reviewedTarget: z.uuid(),
      templateId: z.string().min(1).max(256)
    })
    .strict(),
  z
    .object({
      kind: z.literal('create-target'),
      reviewedTarget: z.uuid(),
      value: z.enum(['orca', 'hermes'])
    })
    .strict(),
  z
    .object({ kind: z.literal('name'), reviewedTarget: z.uuid(), value: z.string().max(4096) })
    .strict(),
  z
    .object({
      kind: z.literal('prompt'),
      reviewedTarget: z.uuid(),
      value: z.string().max(1_000_000)
    })
    .strict(),
  z.object({ kind: z.literal('close'), reviewedTarget: z.uuid() }).strict()
])
export type AutomationEditorViewerAction = z.infer<typeof AutomationEditorViewerActionSchema>
