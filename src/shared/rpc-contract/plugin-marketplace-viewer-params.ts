import { z } from 'zod'

export const PluginMarketplaceViewerCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }),
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
  sourcesOpen: z.boolean(),
  previewOpen: z.boolean()
})
export type PluginMarketplaceViewerState = z.infer<typeof PluginMarketplaceViewerState>
