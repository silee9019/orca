import type { PluginMarketplaceHostInstallPreview } from '../../../../preload/api-types'
import {
  PluginMarketplaceReviewIdentity,
  type PluginMarketplaceViewerCommand,
  type PluginMarketplaceViewerState
} from '../../../../shared/rpc-contract/plugin-marketplace-viewer-params'
import type { PluginMarketplaceParentReadback } from './plugin-marketplace-parent-readback'

type InstallCommand = Extract<PluginMarketplaceViewerCommand, { action: 'install-preview' }>
export function matchesMarketplaceInstallReview(
  command: InstallCommand,
  preview: PluginMarketplaceHostInstallPreview | null
): boolean {
  return (
    preview !== null &&
    !preview.blockedByKillList &&
    command.confirm === command.plugin &&
    preview.marketplaceSourceId === command.source &&
    preview.pluginKey === command.plugin &&
    preview.contentHash === command.contentHash &&
    preview.consentFingerprint === command.consentFingerprint &&
    preview.marketplaceCommit === command.marketplaceCommit &&
    preview.resolvedCommit === command.resolvedCommit
  )
}
export function marketplaceInstallCommitted(
  command: InstallCommand,
  parent: PluginMarketplaceParentReadback | undefined,
  generation: number | null,
  preview: PluginMarketplaceHostInstallPreview | null
): boolean {
  if (
    !parent?.ready ||
    parent.errorPresent ||
    parent.generation !== generation ||
    parent.currentGeneration !== generation
  ) {
    return false
  }
  const matches = parent.installed?.filter((plugin) => plugin.pluginKey === command.plugin) ?? []
  const plugin = matches[0]
  if (
    matches.length !== 1 ||
    !plugin ||
    plugin.source?.kind !== 'marketplace' ||
    !preview ||
    plugin.version !== preview.manifest.version ||
    plugin.source.reference !== preview.source.url ||
    plugin.source.contentHash !== command.contentHash ||
    plugin.consentFingerprint !== command.consentFingerprint ||
    plugin.source.resolvedCommit !== command.resolvedCommit ||
    plugin.source.marketplace?.resolvedCommit !== command.marketplaceCommit
  ) {
    return false
  }
  return (
    !(plugin.needsReconsent || plugin.status === 'pending') ||
    (parent.consentPluginKey === command.plugin &&
      parent.consentFingerprint === command.consentFingerprint)
  )
}
export function publicMarketplaceReview(
  preview: PluginMarketplaceHostInstallPreview | null
): PluginMarketplaceViewerState['review'] {
  const parsed = PluginMarketplaceReviewIdentity.safeParse(preview)
  return preview && parsed.success
    ? {
        ...parsed.data,
        source: preview.marketplaceSourceId,
        plugin: preview.pluginKey,
        workerPresent: Boolean(preview.manifest.main),
        capabilityCount: preview.manifest.capabilities.length,
        blocked: Boolean(preview.blockedByKillList)
      }
    : undefined
}
