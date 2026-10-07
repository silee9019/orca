import { useEffect, useRef } from 'react'
import { PluginMarketplaceViewerCommand } from '../../../../shared/rpc-contract/plugin-marketplace-viewer-params'
import {
  PLUGIN_MARKETPLACE_EVENT,
  type PluginMarketplaceEvent
} from '@/runtime/plugin-marketplace-request'
import { requirePluginMarketplaceViewer } from '@/runtime/plugin-marketplace-viewer-actions'

type CatalogOwner = {
  search: string
  filter: 'all' | 'installed'
  visibleCount: number
  installedCount: number
  loading: boolean
  sourcesOpen: boolean
  previewOpen: boolean
  setSourcesOpen: (value: boolean) => void
  closeSources: () => boolean
  setSearch: (value: string) => void
  setFilter: (value: 'all' | 'installed') => void
}
export function usePluginMarketplaceRequest(owner: CatalogOwner): void {
  const current = useRef(owner)
  current.current = owner
  const pending = useRef<PluginMarketplaceEvent | null>(null)
  const finishCommitted = (): void => {
    const request = pending.current
    if (!request) {
      return
    }
    pending.current = null
    if (request.isSettled()) {
      return
    }
    try {
      requirePluginMarketplaceViewer()
    } catch {
      request.finish(new Error('plugin_marketplace_viewer_changed_effect_unknown'))
      return
    }
    if (Date.now() >= request.expiresAt) {
      request.finish(new Error('plugin_marketplace_readback_expired_effect_unknown'))
      return
    }
    const next = current.current
    const command = request.command
    if (
      (command.action === 'search' && next.search !== command.value) ||
      (command.action === 'filter' && next.filter !== command.value) ||
      (command.action === 'sources-open' && !next.sourcesOpen) ||
      (command.action === 'sources-close' && next.sourcesOpen)
    ) {
      request.finish(new Error('plugin_marketplace_readback_unknown'))
    } else {
      request.finish(undefined, {
        searchPresent: next.search.length > 0,
        filter: next.filter,
        visibleCount: next.visibleCount,
        installedCount: next.installedCount,
        loading: next.loading,
        sourcesOpen: next.sourcesOpen,
        previewOpen: next.previewOpen
      })
    }
  }
  useEffect(finishCommitted)
  useEffect(() => {
    const receive = (event: WindowEventMap[typeof PLUGIN_MARKETPLACE_EVENT]): void => {
      const request = event.detail
      const parsed = PluginMarketplaceViewerCommand.safeParse(request.command)
      if (!parsed.success) {
        return
      }
      const command = parsed.data
      request.offer(() => {
        try {
          if (request.isSettled() || Date.now() >= request.expiresAt) {
            throw new Error('plugin_marketplace_request_expired')
          }
          requirePluginMarketplaceViewer()
          if (
            command.action !== 'status' &&
            (current.current.previewOpen ||
              (current.current.sourcesOpen &&
                command.action !== 'sources-open' &&
                command.action !== 'sources-close'))
          ) {
            throw new Error('plugin_marketplace_dialog_busy')
          }
          if (pending.current && !pending.current.isSettled()) {
            throw new Error('plugin_marketplace_request_busy')
          }
          if (command.action === 'sources-close' && !current.current.sourcesOpen) {
            throw new Error('plugin_marketplace_source_not_open')
          }
          pending.current = request
          if (command.action === 'search' && current.current.search !== command.value) {
            current.current.setSearch(command.value)
          } else if (command.action === 'filter' && current.current.filter !== command.value) {
            current.current.setFilter(command.value)
          } else if (command.action === 'sources-open' && !current.current.sourcesOpen) {
            current.current.setSourcesOpen(true)
          } else if (command.action === 'sources-close') {
            if (!current.current.closeSources()) {
              throw new Error('plugin_marketplace_source_busy')
            }
          } else {
            finishCommitted()
          }
        } catch (error) {
          request.finish(
            error instanceof Error ? error : new Error('plugin_marketplace_action_failed')
          )
        }
      })
    }
    window.addEventListener(PLUGIN_MARKETPLACE_EVENT, receive)
    return () => {
      pending.current?.finish(new Error('plugin_marketplace_owner_changed_effect_unknown'))
      pending.current = null
      window.removeEventListener(PLUGIN_MARKETPLACE_EVENT, receive)
    }
  }, [])
}
