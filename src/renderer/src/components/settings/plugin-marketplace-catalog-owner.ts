import type { PluginMarketplaceParentReadback } from './plugin-marketplace-parent-readback'
import type {
  PluginHostListEntry,
  PluginMarketplaceHostInstallPreview,
  PluginMarketplaceHostListing
} from '../../../../preload/api-types'
export type CatalogOwner = {
  search: string
  filter: 'all' | 'installed'
  visibleCount: number
  installedCount: number
  loading: boolean
  errorPresent: boolean
  reload: () => Promise<(() => boolean) | undefined>
  refresh: () => Promise<(() => boolean) | undefined>
  isRefreshBusy: () => boolean
  readParent?: () => PluginMarketplaceParentReadback
  sourcesOpen: boolean
  previewOpen: boolean
  preview: PluginMarketplaceHostInstallPreview | null
  previewBusy: boolean
  isPreviewBusy: () => boolean
  installBusy: boolean
  installPreview: (
    canApply: (stage: 'review' | 'parent') => boolean
  ) => Promise<(() => boolean) | undefined>
  visibleListings: PluginMarketplaceHostListing[]
  installedByKey: ReadonlyMap<string, PluginHostListEntry>
  openPreview: (
    listing: PluginMarketplaceHostListing,
    update: boolean,
    canApply: (value: PluginMarketplaceHostInstallPreview) => boolean
  ) => Promise<(() => boolean) | undefined>
  closePreview: () => void
  setSourcesOpen: (value: boolean) => void
  closeSources: () => boolean
  setSearch: (value: string) => void
  setFilter: (value: 'all' | 'installed') => void
}
