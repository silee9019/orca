import { usePluginMarketplaceCatalog } from './use-plugin-marketplace-catalog'
import { usePluginMarketplaceRequest } from './use-plugin-marketplace-request'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, Loader2, RefreshCw, SearchX, Settings2, Store } from 'lucide-react'
import type {
  PluginHostListEntry,
  PluginMarketplaceHostInstallPreview,
  PluginMarketplaceHostListing
} from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { PluginCatalogEmptyState } from '../plugin-catalog/PluginCatalogEmptyState'
import {
  PluginCatalogLayout,
  type PluginCatalogFilter
} from '../plugin-catalog/PluginCatalogLayout'
import { Button } from '../ui/button'
import { PluginMarketplaceListingRow } from './PluginMarketplaceListingRow'
import {
  PluginMarketplacePreviewDialog,
  type PluginMarketplacePreviewMode
} from './PluginMarketplacePreviewDialog'
import { PluginMarketplaceSourceDialog } from './PluginMarketplaceSourceDialog'

type PluginMarketplaceBrowserProps = {
  installedPlugins: readonly PluginHostListEntry[]
  onInstalled: (pluginKey: string) => Promise<void>
  onRefreshInstalled?: () => Promise<void>
  renderInstalledContent?: (search: string) => React.ReactNode
}

function marketplaceError(cause: unknown, fallback: string): string {
  console.warn('[plugins] marketplace action failed:', cause)
  return fallback
}

function marketplaceLoadError(cause: unknown): string {
  return marketplaceError(
    cause,
    translate(
      'auto.components.settings.PluginMarketplaceBrowser.loadFailed',
      'Could not load marketplace plugins.'
    )
  )
}

export function PluginMarketplaceBrowser({
  installedPlugins,
  onInstalled,
  onRefreshInstalled,
  renderInstalledContent
}: PluginMarketplaceBrowserProps): React.JSX.Element {
  const mountedRef = useRef(false)
  const { sources, listings, loading, error, setError, loadMarketplaceData, reloadWithReceipt } =
    usePluginMarketplaceCatalog(mountedRef, marketplaceLoadError)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PluginCatalogFilter>('all')
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const sourceCloseRef = useRef<(() => boolean) | null>(null)
  const [preview, setPreview] = useState<PluginMarketplaceHostInstallPreview | null>(null)
  const [previewMode, setPreviewMode] = useState<PluginMarketplacePreviewMode>('install')
  const [previewBusyKey, setPreviewBusyKey] = useState<string | null>(null)
  const [installBusy, setInstallBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const previewRequestRef = useRef(0)
  const previewOperationsRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    void loadMarketplaceData()
    return () => {
      mountedRef.current = false
      previewRequestRef.current += 1
    }
  }, [loadMarketplaceData])

  const installedByKey = useMemo(
    () => new Map(installedPlugins.map((plugin) => [plugin.pluginKey, plugin])),
    [installedPlugins]
  )
  const visibleListings = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) {
      return listings
    }
    return listings.filter((listing) =>
      [
        listing.pluginKey,
        listing.description ?? '',
        listing.marketplaceName,
        listing.marketplaceOwner,
        ...listing.categories
      ].some((value) => value.toLocaleLowerCase().includes(query))
    )
  }, [listings, search])

  const refresh = async (): Promise<void> => {
    setRefreshBusy(true)
    setError(null)
    try {
      await Promise.all([window.api.plugins.refreshMarketplaces({}), onRefreshInstalled?.()])
      await loadMarketplaceData()
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          marketplaceError(
            cause,
            translate(
              'auto.components.settings.PluginMarketplaceBrowser.refreshFailed',
              'Could not refresh marketplaces. Cached listings remain available.'
            )
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setRefreshBusy(false)
      }
    }
  }

  const openPreview = async (
    listing: PluginMarketplaceHostListing,
    update: boolean,
    canApply?: (value: PluginMarketplaceHostInstallPreview) => boolean
  ): Promise<(() => boolean) | undefined> => {
    const requestId = ++previewRequestRef.current
    previewOperationsRef.current++
    setPreviewBusyKey(listing.pluginKey)
    setActionError(null)
    setError(null)
    try {
      const nextPreview = update
        ? await window.api.plugins.previewMarketplaceUpdate({ pluginKey: listing.pluginKey })
        : await window.api.plugins.previewMarketplacePlugin({
            marketplaceSourceId: listing.marketplaceSourceId,
            pluginKey: listing.pluginKey
          })
      if (mountedRef.current && requestId === previewRequestRef.current) {
        if (canApply && !canApply(nextPreview)) {
          return undefined
        }
        setPreviewMode(update ? 'update' : 'install')
        setPreview(nextPreview)
        return () => mountedRef.current && requestId === previewRequestRef.current
      }
    } catch (cause) {
      if (mountedRef.current && requestId === previewRequestRef.current) {
        setError(
          marketplaceError(
            cause,
            translate(
              'auto.components.settings.PluginMarketplaceBrowser.previewFailed',
              'Could not prepare this plugin for review. Refresh the marketplace and try again.'
            )
          )
        )
      }
    } finally {
      previewOperationsRef.current--
      if (mountedRef.current && requestId === previewRequestRef.current) {
        setPreviewBusyKey(null)
      }
    }
    return undefined
  }

  const installPreview = async (): Promise<void> => {
    if (!preview || installBusy) {
      return
    }
    previewOperationsRef.current++
    setInstallBusy(true)
    setActionError(null)
    try {
      const result = await window.api.plugins.installMarketplacePlugin({
        marketplaceSourceId: preview.marketplaceSourceId,
        marketplaceCommit: preview.marketplaceCommit,
        pluginKey: preview.pluginKey,
        resolvedCommit: preview.resolvedCommit
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
      setPreview(null)
      await onInstalled(result.pluginKey)
    } catch (cause) {
      if (mountedRef.current) {
        setActionError(
          marketplaceError(
            cause,
            translate(
              'auto.components.settings.PluginMarketplaceBrowser.installFailed',
              'Could not install this plugin. The reviewed source may have changed.'
            )
          )
        )
      }
    } finally {
      previewOperationsRef.current--
      if (mountedRef.current) {
        setInstallBusy(false)
      }
    }
  }

  usePluginMarketplaceRequest({
    search,
    filter,
    visibleCount: visibleListings.length,
    installedCount: installedPlugins.length,
    loading,
    errorPresent: error !== null,
    reload: reloadWithReceipt,
    sourcesOpen,
    previewOpen: preview !== null,
    preview,
    previewBusy: previewBusyKey !== null,
    isPreviewBusy: () => previewOperationsRef.current > 0,
    installBusy,
    visibleListings,
    installedByKey,
    openPreview,
    closePreview: () => setPreview(null),
    setSearch,
    setFilter,
    setSourcesOpen,
    closeSources: () => sourceCloseRef.current?.() ?? false
  })

  const currentVersion = Boolean(
    preview && installedByKey.get(preview.pluginKey)?.source?.contentHash === preview.contentHash
  )

  return (
    <>
      <PluginCatalogLayout
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        allCount={listings.length}
        installedCount={installedPlugins.length}
        toolbar={
          <>
            <Button variant="ghost" size="xs" onClick={() => setSourcesOpen(true)}>
              <Settings2 />
              {translate(
                'auto.components.settings.PluginMarketplaceBrowser.manageSources',
                'Manage sources'
              )}
            </Button>
            <Button variant="ghost" size="xs" disabled={refreshBusy} onClick={() => void refresh()}>
              <RefreshCw className={refreshBusy ? 'animate-spin' : undefined} />
              {refreshBusy
                ? translate(
                    'auto.components.settings.PluginMarketplaceBrowser.refreshing',
                    'Refreshing…'
                  )
                : translate('auto.components.settings.PluginMarketplaceBrowser.refresh', 'Refresh')}
            </Button>
          </>
        }
      >
        {filter === 'installed' ? (
          renderInstalledContent ? (
            renderInstalledContent(search)
          ) : (
            <PluginCatalogEmptyState
              icon={Blocks}
              title={translate(
                'auto.components.settings.PluginMarketplaceBrowser.noInstalledTitle',
                'No plugins installed'
              )}
              description={translate(
                'auto.components.settings.PluginMarketplaceBrowser.noInstalled',
                'Plugins you install appear here.'
              )}
            />
          )
        ) : loading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[13px] text-muted-foreground">
            <Loader2 className="animate-spin" />
            {translate(
              'auto.components.settings.PluginMarketplaceBrowser.loading',
              'Loading marketplace plugins…'
            )}
          </div>
        ) : (
          <>
            {error ? (
              <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <p>{error}</p>
                <Button variant="outline" size="xs" className="mt-2" onClick={loadMarketplaceData}>
                  {translate(
                    'auto.components.settings.PluginMarketplaceBrowser.tryAgain',
                    'Try again'
                  )}
                </Button>
              </div>
            ) : null}
            {sources.length === 0 ? (
              <PluginCatalogEmptyState
                icon={Store}
                title={translate(
                  'auto.components.settings.PluginMarketplaceBrowser.noSourcesTitle',
                  'No marketplaces configured'
                )}
                description={translate(
                  'auto.components.settings.PluginMarketplaceBrowser.noSources',
                  'Add an official, community, or private Git marketplace to browse plugins.'
                )}
                action={
                  <Button variant="outline" size="sm" onClick={() => setSourcesOpen(true)}>
                    {translate(
                      'auto.components.settings.PluginMarketplaceBrowser.addSource',
                      'Add marketplace'
                    )}
                  </Button>
                }
              />
            ) : visibleListings.length === 0 ? (
              search ? (
                <PluginCatalogEmptyState
                  icon={SearchX}
                  title={translate(
                    'auto.components.settings.PluginMarketplaceBrowser.noResultsTitle',
                    'No matching plugins'
                  )}
                  description={translate(
                    'auto.components.settings.PluginMarketplaceBrowser.noResults',
                    'No marketplace plugins match this search.'
                  )}
                  action={
                    <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                      {translate(
                        'auto.components.settings.PluginMarketplaceBrowser.clearSearch',
                        'Clear search'
                      )}
                    </Button>
                  }
                />
              ) : (
                <PluginCatalogEmptyState
                  icon={Blocks}
                  title={translate(
                    'auto.components.settings.PluginMarketplaceBrowser.emptyTitle',
                    'Nothing listed yet'
                  )}
                  description={translate(
                    'auto.components.settings.PluginMarketplaceBrowser.empty',
                    'The configured marketplaces do not list any plugins.'
                  )}
                />
              )
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleListings.map((listing) => (
                  <PluginMarketplaceListingRow
                    key={`${listing.marketplaceSourceId}:${listing.pluginKey}`}
                    listing={listing}
                    installed={installedByKey.get(listing.pluginKey) ?? null}
                    busy={previewBusyKey === listing.pluginKey}
                    onPreview={(entry, update) => void openPreview(entry, update)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </PluginCatalogLayout>
      <PluginMarketplaceSourceDialog
        open={sourcesOpen}
        sources={sources}
        onOpenChange={setSourcesOpen}
        onChanged={loadMarketplaceData}
        closeRequestRef={sourceCloseRef}
      />
      <PluginMarketplacePreviewDialog
        key={preview ? `${preview.pluginKey}:${preview.contentHash}` : 'closed'}
        preview={preview}
        mode={previewMode}
        busy={installBusy}
        currentVersion={currentVersion}
        error={actionError}
        onClose={() => setPreview(null)}
        onConfirm={() => void installPreview()}
      />
    </>
  )
}
