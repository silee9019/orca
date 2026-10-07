import type { PluginHostListEntry } from '../../../../preload/api-types'

export type PluginMarketplaceMutationReceipt = {
  canApply: () => boolean
  applied: () => void
}
export type PluginMarketplaceParentReadback = {
  generation: number
  currentGeneration: number
  ready: boolean
  errorPresent: boolean
  installedCount: number
  installed?: readonly PluginHostListEntry[]
  dialogBusy?: boolean
  consentPluginKey?: string | null
  consentFingerprint?: string | null
}
