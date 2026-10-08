import { z } from 'zod'
import {
  PluginMarketplaceInstallParams,
  PluginMarketplacePreviewParams,
  PluginMarketplaceSourceParams
} from './rpc-contract/plugins-management-params'

export const PluginMarketplaceSourceViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('url'), value: z.string().max(4096) }),
  z.strictObject({ kind: z.literal('ref'), value: z.string().max(4096) }),
  z.strictObject({ kind: z.literal('focus-url') }),
  z.strictObject({ kind: z.literal('add') }),
  z.strictObject({
    kind: z.literal('refresh'),
    sourceId: PluginMarketplaceSourceParams.shape.sourceId
  }),
  z.strictObject({
    kind: z.literal('remove'),
    sourceId: PluginMarketplaceSourceParams.shape.sourceId
  }),
  z.strictObject({ kind: z.literal('close') })
])
export type PluginMarketplaceSourceViewerAction = z.infer<
  typeof PluginMarketplaceSourceViewerActionSchema
>
export const PluginMarketplacePreviewViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('close') }),
  PluginMarketplaceInstallParams.extend({
    kind: z.literal('confirm'),
    contentHash: z.string().min(1).max(256)
  })
])
export type PluginMarketplacePreviewViewerAction = z.infer<
  typeof PluginMarketplacePreviewViewerActionSchema
>
export const PluginMarketplaceViewerActionSchema = z.discriminatedUnion('kind', [
  PluginMarketplacePreviewParams.extend({ kind: z.literal('preview') }),
  z.strictObject({
    kind: z.literal('preview-form'),
    action: PluginMarketplacePreviewViewerActionSchema
  }),
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('query'), value: z.string().max(4096) }),
  z.strictObject({ kind: z.literal('filter'), value: z.enum(['all', 'installed']) }),
  z.strictObject({ kind: z.literal('open-sources') }),
  z.strictObject({
    kind: z.literal('source-form'),
    action: PluginMarketplaceSourceViewerActionSchema
  })
])
export type PluginMarketplaceViewerAction = z.infer<typeof PluginMarketplaceViewerActionSchema>
