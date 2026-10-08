import { PluginSettingsViewerActionSchema } from './plugin-settings-viewer-command'
import { SkillsViewerActionSchema } from './skills-viewer-command'
import { AutomationViewerActionSchema } from './automation-viewer-command'
import { ArtifactViewerActionSchema } from './artifact-viewer-command'
import { z } from 'zod'
import { ResourceViewerActionSchema } from './resource-manager-command'
import { UsageViewerActionSchema } from './rpc-contract/usage-params'
import { AccountsViewerActionSchema } from './accounts-viewer-command'

export const ACCOUNT_VIEWER_REQUEST_CHANNEL = 'accounts:viewerRequest'
export const ACCOUNT_VIEWER_RESPONSE_CHANNEL = 'accounts:viewerResponse'
export const AccountViewerCommandSchema = z.discriminatedUnion('domain', [
  z
    .object({ domain: z.literal('plugin-settings'), action: PluginSettingsViewerActionSchema })
    .strict(),
  z.object({ domain: z.literal('skills'), action: SkillsViewerActionSchema }).strict(),
  z.object({ domain: z.literal('automation'), action: AutomationViewerActionSchema }).strict(),
  z.object({ domain: z.literal('artifact'), action: ArtifactViewerActionSchema }).strict(),
  z.object({ domain: z.literal('resource'), action: ResourceViewerActionSchema }).strict(),
  z.object({ domain: z.literal('usage'), action: UsageViewerActionSchema }).strict(),
  z.object({ domain: z.literal('account'), action: AccountsViewerActionSchema }).strict()
])
export const AccountViewerRequestSchema = z
  .object({
    requestId: z.uuid(),
    viewer: z.literal('desktop'),
    command: AccountViewerCommandSchema
  })
  .strict()
export const AccountViewerResponseSchema = z.discriminatedUnion('ok', [
  z.object({ requestId: z.uuid(), ok: z.literal(true), result: z.unknown() }).strict(),
  z
    .object({ requestId: z.uuid(), ok: z.literal(false), error: z.string().min(1).max(512) })
    .strict()
])
export type AccountViewerCommand = z.infer<typeof AccountViewerCommandSchema>
export type AccountViewerRequest = z.infer<typeof AccountViewerRequestSchema>
export type AccountViewerResponse = z.infer<typeof AccountViewerResponseSchema>
export type AccountViewerApi = {
  onRequest: (callback: (request: AccountViewerRequest) => void) => () => void
  acknowledge: (response: AccountViewerResponse) => void
}
