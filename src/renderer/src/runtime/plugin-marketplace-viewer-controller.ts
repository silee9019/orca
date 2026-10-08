import {
  applyPluginMarketplacePreviewViewerAction,
  type PluginMarketplacePreviewViewerState
} from './plugin-marketplace-preview-viewer-controller'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PluginHostListEntry, PluginMarketplaceHostListing } from '../../../preload/api-types'
import {
  PluginMarketplaceViewerActionSchema,
  type PluginMarketplaceViewerAction
} from '../../../shared/plugin-marketplace-viewer-command'
import {
  applyPluginMarketplaceSourceViewerAction,
  type PluginMarketplaceSourceViewerState
} from './plugin-marketplace-source-viewer-controller'

type Browser = {
  search: string
  filter: 'all' | 'installed'
  loading: boolean
  refreshBusy: boolean
  previewBusyKey: string | null
  installBusy: boolean
  sourcesOpen: boolean
  previewOpen: boolean
  error: string | null
  installedPlugins: readonly PluginHostListEntry[]
  openPreview: (listing: PluginMarketplaceHostListing, update: boolean) => Promise<boolean>
  listings: readonly PluginMarketplaceHostListing[]
  setSearch: (value: string) => void
  setFilter: (value: 'all' | 'installed') => void
  setSourcesOpen: (value: boolean) => void
}
function snapshot(browser: Browser) {
  return {
    search: browser.search,
    filter: browser.filter,
    loading: browser.loading,
    busy: browser.refreshBusy || Boolean(browser.previewBusyKey) || browser.installBusy,
    sourcesOpen: browser.sourcesOpen,
    previewOpen: browser.previewOpen,
    error: browser.error,
    listings: browser.listings.map((listing) => ({
      marketplaceSourceId: listing.marketplaceSourceId,
      pluginKey: listing.pluginKey,
      marketplaceName: listing.marketplaceName,
      marketplaceCommit: listing.marketplaceCommit,
      blocked: Boolean(listing.blockedByKillList)
    }))
  }
}
export type PluginMarketplaceViewerState = ReturnType<typeof snapshot> & {
  source?: PluginMarketplaceSourceViewerState
  preview?: PluginMarketplacePreviewViewerState
}
type Control = (action: PluginMarketplaceViewerAction) => Promise<PluginMarketplaceViewerState>
type Request = {
  ready: boolean
  source?: PluginMarketplaceSourceViewerState
  preview?: PluginMarketplacePreviewViewerState
  resolve: (state: PluginMarketplaceViewerState) => void
  reject: (error: Error) => void
}
const mountedBrowsers = new Map<Control, () => boolean>()
export function pluginMarketplaceModalOpen(): boolean {
  return [...mountedBrowsers.values()].some((read) => read())
}
export async function applyPluginMarketplaceViewerAction(
  action: PluginMarketplaceViewerAction
): Promise<PluginMarketplaceViewerState> {
  const parsed = PluginMarketplaceViewerActionSchema.parse(action)
  if (mountedBrowsers.size !== 1) {
    throw new Error(mountedBrowsers.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedBrowsers.keys().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function usePluginMarketplaceViewerController(browser: Browser): void {
  const latest = useRef(browser)
  const [, setRevision] = useState(0)
  const pending = useRef<Request | null>(null)
  useLayoutEffect(() => {
    latest.current = browser
  })
  useEffect(() => {
    if (!pending.current?.ready) {
      return
    }
    const request = pending.current
    pending.current = null
    if (request.preview?.closed && browser.previewOpen) {
      request.reject(new Error('plugin_marketplace_preview_changed'))
    } else if (request.source?.closed && browser.sourcesOpen) {
      request.reject(new Error('plugin_marketplace_source_dialog_changed'))
    } else {
      request.resolve({
        ...snapshot(browser),
        ...(request.source ? { source: request.source } : {}),
        ...(request.preview ? { preview: request.preview } : {})
      })
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (action.kind === 'preview-form' && action.action.kind === 'get') {
        return {
          ...snapshot(current),
          preview: await applyPluginMarketplacePreviewViewerAction(action.action)
        }
      }
      if (action.kind === 'source-form' && action.action.kind === 'get') {
        return {
          ...snapshot(current),
          source: await applyPluginMarketplaceSourceViewerAction(action.action)
        }
      }
      if (
        pending.current ||
        current.refreshBusy ||
        current.previewBusyKey ||
        current.installBusy ||
        current.loading
      ) {
        throw new Error('viewer_busy')
      }
      if (
        (current.previewOpen && action.kind !== 'preview-form') ||
        (current.sourcesOpen && action.kind !== 'source-form')
      ) {
        throw new Error('viewer_modal_open')
      }
      if (action.kind === 'preview-form' && !current.previewOpen) {
        throw new Error('viewer_unavailable')
      }
      if (action.kind === 'source-form' && !current.sourcesOpen) {
        throw new Error('viewer_unavailable')
      }
      const matches =
        action.kind === 'preview'
          ? current.listings.filter(
              (entry) =>
                entry.marketplaceSourceId === action.marketplaceSourceId &&
                entry.pluginKey === action.pluginKey
            )
          : []
      const listing = matches[0]
      const installed = listing
        ? current.installedPlugins.find((entry) => entry.pluginKey === listing.pluginKey)
        : undefined
      if (action.kind === 'preview') {
        if (current.filter !== 'all' || matches.length !== 1 || !listing) {
          throw new Error(
            matches.length > 1 ? 'viewer_ambiguous' : 'plugin_marketplace_listing_not_visible'
          )
        }
        if (listing.blockedByKillList || (installed && installed.source?.kind !== 'marketplace')) {
          throw new Error('plugin_marketplace_preview_unavailable')
        }
      }
      return new Promise((resolve, reject) => {
        const request: Request = { ready: false, resolve, reject }
        pending.current = request
        void (async () => {
          switch (action.kind) {
            case 'preview-form':
              request.preview = await applyPluginMarketplacePreviewViewerAction(action.action)
              break
            case 'preview':
              if (!listing || !(await current.openPreview(listing, Boolean(installed)))) {
                throw new Error('plugin_marketplace_preview_failed')
              }
              break
            case 'source-form':
              request.source = await applyPluginMarketplaceSourceViewerAction(action.action)
              break
            case 'query':
              current.setSearch(action.value)
              break
            case 'filter':
              current.setFilter(action.value)
              break
            case 'open-sources':
              current.setSourcesOpen(true)
              break
          }
        })().then(
          () => {
            if (pending.current !== request) {
              return
            }
            request.ready = true
            setRevision((value) => value + 1)
          },
          (error: unknown) => {
            if (pending.current !== request) {
              return
            }
            pending.current = null
            reject(error instanceof Error ? error : new Error('plugin_marketplace_action_failed'))
          }
        )
      })
    }
    mountedBrowsers.set(control, () => latest.current.sourcesOpen || latest.current.previewOpen)
    return () => {
      mountedBrowsers.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
