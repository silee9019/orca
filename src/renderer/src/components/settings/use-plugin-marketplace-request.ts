import { publicMarketplaceReview } from './plugin-marketplace-install-receipt'
import { usePluginMarketplaceInstallRequest } from './use-plugin-marketplace-install-request'
import type { CatalogOwner } from './plugin-marketplace-catalog-owner'
import { useEffect, useRef, useState } from 'react'
import { PluginMarketplaceViewerCommand } from '../../../../shared/rpc-contract/plugin-marketplace-viewer-params'
import {
  PLUGIN_MARKETPLACE_EVENT,
  type PluginMarketplaceEvent
} from '@/runtime/plugin-marketplace-request'
import { requirePluginMarketplaceViewer } from '@/runtime/plugin-marketplace-viewer-actions'

export function usePluginMarketplaceRequest(owner: CatalogOwner): void {
  const current = useRef(owner)
  current.current = owner
  const pending = useRef<PluginMarketplaceEvent | null>(null)
  const ready = useRef(true)
  const previewReceipt = useRef<(() => boolean) | undefined>(undefined)
  const expectedParentGeneration = useRef<number | null>(null)
  const refreshReceipt = useRef<(() => boolean) | undefined>(undefined)
  const reloadReceipt = useRef<(() => boolean) | undefined>(undefined)
  const [, publishCompletion] = useState(0)
  const installation = usePluginMarketplaceInstallRequest({
    current,
    pending,
    ready,
    expectedParentGeneration,
    publishCompletion
  })
  const installRequest = useRef(installation)
  installRequest.current = installation
  const finishCommitted = (): void => {
    const request = pending.current
    if (!request || !ready.current) {
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
    if (request.command.action === 'reload' && !reloadReceipt.current?.()) {
      request.finish(new Error('plugin_marketplace_load_failed_effect_unknown'))
      return
    }
    if (request.command.action === 'preview' && !previewReceipt.current?.()) {
      request.finish(new Error('plugin_marketplace_preview_failed_effect_unknown'))
      return
    }
    if (
      request.command.action === 'install-preview' &&
      !installRequest.current.committed(request.command)
    ) {
      request.finish(new Error('plugin_marketplace_install_failed_effect_unknown'))
      return
    }
    if (request.command.action === 'refresh') {
      const parent = current.current.readParent?.()
      if (
        !refreshReceipt.current?.() ||
        !parent?.ready ||
        parent.errorPresent ||
        parent.generation !== expectedParentGeneration.current ||
        parent.currentGeneration !== expectedParentGeneration.current ||
        parent.installedCount !== current.current.installedCount
      ) {
        request.finish(new Error('plugin_marketplace_refresh_failed_effect_unknown'))
        return
      }
    }
    const next = current.current
    const command = request.command
    if (
      (command.action === 'search' && next.search !== command.value) ||
      (command.action === 'filter' && next.filter !== command.value) ||
      (command.action === 'sources-open' && !next.sourcesOpen) ||
      (command.action === 'sources-close' && next.sourcesOpen) ||
      (command.action === 'reload' && next.errorPresent) ||
      (command.action === 'preview' &&
        (next.preview?.marketplaceSourceId !== command.source ||
          next.preview.pluginKey !== command.plugin)) ||
      (command.action === 'preview-close' && next.preview !== null)
    ) {
      request.finish(new Error('plugin_marketplace_readback_unknown'))
    } else {
      request.finish(undefined, {
        searchPresent: next.search.length > 0,
        filter: next.filter,
        visibleCount: next.visibleCount,
        installedCount: next.installedCount,
        loading: next.loading,
        errorPresent: next.errorPresent,
        sourcesOpen: next.sourcesOpen,
        previewOpen: next.previewOpen,
        review: publicMarketplaceReview(next.preview)
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
            ((current.current.previewOpen &&
              command.action !== 'preview-close' &&
              command.action !== 'install-preview') ||
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
          if (
            command.action === 'preview-close' &&
            (current.current.preview?.marketplaceSourceId !== command.source ||
              current.current.preview.pluginKey !== command.plugin)
          ) {
            throw new Error('plugin_marketplace_preview_target_mismatch')
          }
          if (
            (command.action === 'preview' ||
              command.action === 'preview-close' ||
              command.action === 'install-preview') &&
            (current.current.isPreviewBusy() ||
              current.current.previewBusy ||
              current.current.installBusy)
          ) {
            throw new Error('plugin_marketplace_preview_busy')
          }
          if (command.action === 'refresh' && current.current.isRefreshBusy()) {
            throw new Error('plugin_marketplace_refresh_busy')
          }
          if (command.action === 'refresh') {
            const parent = current.current.readParent?.()
            if (!parent?.ready) {
              throw new Error('plugin_marketplace_parent_unavailable')
            }
            expectedParentGeneration.current = parent.currentGeneration + 1
          }
          if (command.action === 'install-preview') {
            installRequest.current.validate(command)
          }
          pending.current = request
          ready.current = true
          reloadReceipt.current = undefined
          refreshReceipt.current = undefined
          previewReceipt.current = undefined
          if (command.action === 'search' && current.current.search !== command.value) {
            current.current.setSearch(command.value)
          } else if (command.action === 'filter' && current.current.filter !== command.value) {
            current.current.setFilter(command.value)
          } else if (command.action === 'reload' || command.action === 'refresh') {
            ready.current = false
            const operation =
              command.action === 'reload' ? current.current.reload : current.current.refresh
            const failure =
              command.action === 'reload'
                ? 'plugin_marketplace_load_failed_effect_unknown'
                : 'plugin_marketplace_refresh_failed_effect_unknown'
            void operation()
              .then((receipt) => {
                if (pending.current !== request || request.isSettled()) {
                  return
                }
                if (!receipt) {
                  pending.current = null
                  request.finish(new Error(failure))
                  return
                }
                if (command.action === 'reload') {
                  reloadReceipt.current = receipt
                } else {
                  refreshReceipt.current = receipt
                }
                ready.current = true
                publishCompletion((value) => value + 1)
              })
              .catch(() => {
                if (pending.current === request) {
                  pending.current = null
                }
                request.finish(new Error(failure))
              })
          } else if (command.action === 'preview') {
            const matches = current.current.visibleListings.filter(
              (listing) =>
                listing.marketplaceSourceId === command.source &&
                listing.pluginKey === command.plugin
            )
            const listing = matches[0]
            const installed = current.current.installedByKey.get(command.plugin)
            if (
              current.current.filter !== 'all' ||
              current.current.loading ||
              matches.length !== 1 ||
              !listing ||
              listing.blockedByKillList ||
              (installed && installed.source?.kind !== 'marketplace')
            ) {
              throw new Error('plugin_marketplace_listing_unavailable')
            }
            ready.current = false
            void current.current
              .openPreview(listing, installed?.source?.kind === 'marketplace', (preview) => {
                try {
                  requirePluginMarketplaceViewer()
                  return (
                    !request.isSettled() &&
                    Date.now() < request.expiresAt &&
                    !current.current.sourcesOpen &&
                    !current.current.previewOpen &&
                    preview.marketplaceSourceId === command.source &&
                    preview.pluginKey === command.plugin
                  )
                } catch {
                  return false
                }
              })
              .then((receipt) => {
                if (pending.current !== request || request.isSettled()) {
                  return
                }
                if (!receipt) {
                  pending.current = null
                  request.finish(new Error('plugin_marketplace_preview_failed_effect_unknown'))
                  return
                }
                previewReceipt.current = receipt
                ready.current = true
                publishCompletion((value) => value + 1)
              })
              .catch(() => {
                if (pending.current === request) {
                  pending.current = null
                }
                request.finish(new Error('plugin_marketplace_preview_failed_effect_unknown'))
              })
          } else if (command.action === 'install-preview') {
            installRequest.current.start(request)
          } else if (command.action === 'preview-close') {
            current.current.closePreview()
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
