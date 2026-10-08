import { useState, type MutableRefObject } from 'react'
import type { PluginMarketplaceHostInstallPreview } from '../../../../preload/api-types'
import type { PluginMarketplaceMutationReceipt } from './plugin-marketplace-parent-readback'

type MarketplaceInstallOptions = {
  preview: PluginMarketplaceHostInstallPreview | null
  mountedRef: MutableRefObject<boolean>
  previewRequestRef: MutableRefObject<number>
  previewOperationsRef: MutableRefObject<number>
  setPreview: (preview: PluginMarketplaceHostInstallPreview | null) => void
  onInstalled: (pluginKey: string, receipt?: PluginMarketplaceMutationReceipt) => Promise<void>
  formatError: (cause: unknown) => string
}
export function usePluginMarketplaceInstall({
  preview,
  mountedRef,
  previewRequestRef,
  previewOperationsRef,
  setPreview,
  onInstalled,
  formatError
}: MarketplaceInstallOptions) {
  const [installBusy, setInstallBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const installPreview = async (
    canApply?: (stage: 'review' | 'parent') => boolean
  ): Promise<(() => boolean) | undefined> => {
    if (!preview || installBusy || (canApply && previewOperationsRef.current > 0)) {
      return undefined
    }
    const generation = previewRequestRef.current
    const current = (): boolean => mountedRef.current && previewRequestRef.current === generation
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
      if (
        canApply &&
        (!current() ||
          !canApply('review') ||
          result.pluginKey !== preview.pluginKey ||
          result.version !== preview.manifest.version ||
          result.contentHash !== preview.contentHash ||
          result.consentFingerprint !== preview.consentFingerprint ||
          result.resolvedCommit !== preview.resolvedCommit)
      ) {
        return undefined
      }
      setPreview(null)
      if (canApply) {
        let parentApplied = false
        await onInstalled(result.pluginKey, {
          canApply: () => current() && canApply('parent'),
          applied: () => {
            parentApplied = true
          }
        })
        return parentApplied ? current : undefined
      }
      await onInstalled(result.pluginKey)
    } catch (cause) {
      if (mountedRef.current && (!canApply || (current() && canApply('review')))) {
        setActionError(formatError(cause))
      }
    } finally {
      previewOperationsRef.current--
      if (mountedRef.current) {
        setInstallBusy(false)
      }
    }
    return undefined
  }
  return { installPreview, installBusy, actionError, setActionError }
}
