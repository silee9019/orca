import { useRef, useState, type RefObject } from 'react'

type MarketplaceRefreshOptions = {
  mountedRef: RefObject<boolean>
  onRefreshInstalled?: () => Promise<void>
  loadMarketplaceData: () => Promise<void>
  reloadWithReceipt: () => Promise<(() => boolean) | undefined>
  setError: (error: string | null) => void
  formatError: (cause: unknown) => string
}
export function usePluginMarketplaceRefresh({
  mountedRef,
  onRefreshInstalled,
  loadMarketplaceData,
  reloadWithReceipt,
  setError,
  formatError
}: MarketplaceRefreshOptions) {
  const [refreshBusy, setRefreshBusy] = useState(false)
  const activeOperations = useRef(0)
  const refresh = async (withReceipt = false): Promise<(() => boolean) | undefined> => {
    if (withReceipt && !onRefreshInstalled) {
      throw new Error('plugin_marketplace_parent_unavailable')
    }
    activeOperations.current++
    setRefreshBusy(true)
    setError(null)
    try {
      await Promise.all([window.api.plugins.refreshMarketplaces({}), onRefreshInstalled?.()])
      if (withReceipt) {
        return await reloadWithReceipt()
      }
      await loadMarketplaceData()
    } catch (cause) {
      if (mountedRef.current) {
        setError(formatError(cause))
      }
    } finally {
      activeOperations.current--
      if (mountedRef.current) {
        setRefreshBusy(false)
      }
    }
    return undefined
  }
  return { refresh, refreshBusy, isRefreshBusy: () => activeOperations.current > 0 }
}
