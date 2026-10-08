import { z } from 'zod'
import { PLUGIN_COMMIT_PATTERN } from '../plugins/plugin-install-lockfile'

export const PluginMarketplaceReviewIdentity = z.object({
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  consentFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  marketplaceCommit: z.string().regex(PLUGIN_COMMIT_PATTERN),
  resolvedCommit: z.string().regex(PLUGIN_COMMIT_PATTERN)
})

export const PluginMarketplaceViewerCommand = z.discriminatedUnion('action', [
  PluginMarketplaceReviewIdentity.extend({
    action: z.literal('install-preview'),
    source: z.string().regex(/^[0-9a-f]{32}$/),
    plugin: z.string().min(1).max(256),
    confirm: z.string().min(1).max(256)
  }),
  z.object({ action: z.enum(['status', 'sources-open', 'sources-close', 'reload', 'refresh']) }),
  z.object({
    action: z.enum(['preview', 'preview-close']),
    source: z.string().min(1).max(256),
    plugin: z.string().min(1).max(256)
  }),
  z.object({ action: z.literal('search'), value: z.string().max(2048) }),
  z.object({ action: z.literal('filter'), value: z.enum(['all', 'installed']) })
])
export type PluginMarketplaceViewerCommand = z.infer<typeof PluginMarketplaceViewerCommand>
export const PluginMarketplaceViewerState = z.object({
  searchPresent: z.boolean(),
  filter: z.enum(['all', 'installed']),
  visibleCount: z.number().int().nonnegative(),
  installedCount: z.number().int().nonnegative(),
  loading: z.boolean(),
  errorPresent: z.boolean().optional(),
  sourcesOpen: z.boolean(),
  previewOpen: z.boolean(),
  review: PluginMarketplaceReviewIdentity.extend({
    source: z.string(),
    plugin: z.string(),
    workerPresent: z.boolean(),
    capabilityCount: z.number().int().nonnegative(),
    blocked: z.boolean()
  }).optional()
})
export type PluginMarketplaceViewerState = z.infer<typeof PluginMarketplaceViewerState>
