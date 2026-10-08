import { z } from 'zod'
import { PluginMarketplaceViewerActionSchema } from './plugin-marketplace-viewer-command'
import { PluginKeyParams } from './rpc-contract/plugins-management-params'
import { pluginConsentRequestSchema } from './plugins/plugin-consent-request'

const pluginKey = PluginKeyParams.shape.pluginKey
export const PluginConsentViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  pluginConsentRequestSchema.extend({ kind: z.literal('decide') })
])
export type PluginConsentViewerAction = z.infer<typeof PluginConsentViewerActionSchema>
export const PluginInstallViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('source-kind'), value: z.enum(['local-path', 'git']) }),
  z.strictObject({ kind: z.literal('local-path'), value: z.string().max(4096) }),
  z.strictObject({ kind: z.literal('git-url'), value: z.string().max(4096) }),
  z.strictObject({ kind: z.literal('submit') }),
  z.strictObject({ kind: z.literal('close') })
])
export type PluginInstallViewerAction = z.infer<typeof PluginInstallViewerActionSchema>
export const PluginDevelopmentViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('expanded'), value: z.boolean() }),
  z.strictObject({ kind: z.literal('input'), value: z.string().max(4096) })
])
export type PluginDevelopmentViewerAction = z.infer<typeof PluginDevelopmentViewerActionSchema>
export const PluginSettingsViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('marketplace-form'),
    action: PluginMarketplaceViewerActionSchema
  }),
  z.strictObject({
    kind: z.literal('development-form'),
    action: PluginDevelopmentViewerActionSchema
  }),
  z.strictObject({ kind: z.literal('install-form'), action: PluginInstallViewerActionSchema }),
  z.strictObject({
    kind: z.literal('confirm'),
    dialog: z.enum(['remove', 'rollback']),
    pluginKey,
    version: z.string().min(1).max(256)
  }),
  z.strictObject({ kind: z.literal('consent-form'), action: PluginConsentViewerActionSchema }),
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('refresh') }),
  z.strictObject({ kind: z.literal('toggle-enabled'), pluginKey }),
  z.strictObject({ kind: z.literal('logs'), pluginKey, open: z.boolean() }),
  z.strictObject({ kind: z.literal('open'), dialog: z.literal('install') }),
  z.strictObject({ kind: z.literal('cancel'), dialog: z.enum(['remove', 'rollback']), pluginKey }),
  z.strictObject({
    kind: z.literal('open-plugin'),
    dialog: z.enum(['review', 'remove', 'rollback']),
    pluginKey
  })
])
export type PluginSettingsViewerAction = z.infer<typeof PluginSettingsViewerActionSchema>
export const PluginSettingsViewerParams = z.strictObject({
  viewer: z.literal('desktop'),
  action: PluginSettingsViewerActionSchema
})
