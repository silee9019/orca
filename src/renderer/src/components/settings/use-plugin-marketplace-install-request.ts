import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { PluginMarketplaceHostInstallPreview } from '../../../../preload/api-types'
import type { PluginMarketplaceViewerCommand } from '../../../../shared/rpc-contract/plugin-marketplace-viewer-params'
import type { PluginMarketplaceEvent } from '@/runtime/plugin-marketplace-request'
import { requirePluginMarketplaceViewer } from '@/runtime/plugin-marketplace-viewer-actions'
import type { CatalogOwner } from './plugin-marketplace-catalog-owner'
import {
  marketplaceInstallCommitted,
  matchesMarketplaceInstallReview
} from './plugin-marketplace-install-receipt'

type InstallCommand = Extract<PluginMarketplaceViewerCommand, { action: 'install-preview' }>
type MarketplaceInstallRequestOptions = {
  current: MutableRefObject<CatalogOwner>
  pending: MutableRefObject<PluginMarketplaceEvent | null>
  ready: MutableRefObject<boolean>
  expectedParentGeneration: MutableRefObject<number | null>
  publishCompletion: Dispatch<SetStateAction<number>>
}
export function usePluginMarketplaceInstallRequest({
  current,
  pending,
  ready,
  expectedParentGeneration,
  publishCompletion
}: MarketplaceInstallRequestOptions) {
  const installedReview = useRef<PluginMarketplaceHostInstallPreview | null>(null)
  const installReceipt = useRef<(() => boolean) | undefined>(undefined)
  const validate = (command: InstallCommand): void => {
    const owner = current.current
    const parent = owner.readParent?.()
    if (
      !matchesMarketplaceInstallReview(command, owner.preview) ||
      owner.installedByKey.get(command.plugin)?.source?.contentHash === command.contentHash
    ) {
      throw new Error('plugin_marketplace_review_identity_mismatch')
    }
    if (
      !parent?.ready ||
      parent.errorPresent ||
      parent.dialogBusy ||
      parent.currentGeneration !== parent.generation
    ) {
      throw new Error('plugin_marketplace_parent_unavailable')
    }
    expectedParentGeneration.current = parent.currentGeneration + 1
    installReceipt.current = undefined
  }
  const start = (request: PluginMarketplaceEvent): void => {
    ready.current = false
    const captured = current.current.preview
    installedReview.current = captured
    void current.current
      .installPreview((stage) => {
        try {
          requirePluginMarketplaceViewer()
          const owner = current.current
          const parent = owner.readParent?.()
          return (
            !request.isSettled() &&
            Date.now() < request.expiresAt &&
            !owner.sourcesOpen &&
            parent?.ready === true &&
            !parent.dialogBusy &&
            (stage === 'review'
              ? owner.preview === captured
              : owner.preview === null || owner.preview === captured)
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
          request.finish(new Error('plugin_marketplace_install_failed_effect_unknown'))
          return
        }
        installReceipt.current = receipt
        ready.current = true
        publishCompletion((value) => value + 1)
      })
      .catch(() => {
        if (pending.current === request) {
          pending.current = null
        }
        request.finish(new Error('plugin_marketplace_install_failed_effect_unknown'))
      })
  }
  return {
    validate,
    start,
    committed: (command: InstallCommand): boolean =>
      Boolean(installReceipt.current?.()) &&
      current.current.preview === null &&
      marketplaceInstallCommitted(
        command,
        current.current.readParent?.(),
        expectedParentGeneration.current,
        installedReview.current
      )
  }
}
