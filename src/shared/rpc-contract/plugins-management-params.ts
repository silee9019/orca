import { z } from 'zod'
import { isQualifiedPluginKey } from '../plugins/plugin-manifest'
import { isAllowedPluginGitUrl, PLUGIN_COMMIT_PATTERN } from '../plugins/plugin-install-lockfile'

export const PluginKeyParams = z.strictObject({
  pluginKey: z.string().refine(isQualifiedPluginKey, 'invalid qualified plugin key')
})
export const PluginInstallParams = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('local-path'), path: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('git'),
    url: z.string().trim().min(1).refine(isAllowedPluginGitUrl),
    ref: z.string().trim().min(1)
  })
])
export const PLUGIN_MARKETPLACE_SOURCE_ID_PATTERN = /^[0-9a-f]{32}$/
export const PluginMarketplaceSourceParams = z.strictObject({
  sourceId: z.string().regex(PLUGIN_MARKETPLACE_SOURCE_ID_PATTERN)
})
export const PluginMarketplaceRefreshParams = PluginMarketplaceSourceParams.partial()
export const PluginMarketplacePreviewParams = z.strictObject({
  marketplaceSourceId: PluginMarketplaceSourceParams.shape.sourceId,
  pluginKey: PluginKeyParams.shape.pluginKey
})
export const PluginMarketplaceInstallParams = PluginMarketplacePreviewParams.extend({
  marketplaceCommit: z.string().regex(PLUGIN_COMMIT_PATTERN),
  resolvedCommit: z.string().regex(PLUGIN_COMMIT_PATTERN)
})
