import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type {
  PluginMarketplaceHostListing,
  PluginMarketplaceHostSourceState
} from '../../../../preload/api-types'

export function usePluginMarketplaceCatalog(
  mountedRef: RefObject<boolean>,
  formatError: (cause: unknown) => string
) {
  const [sources, setSources] = useState<PluginMarketplaceHostSourceState[]>([])
  const [listings, setListings] = useState<PluginMarketplaceHostListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const receipt = useRef({ generation: 0, ok: false })
  const loadMarketplaceData = useCallback(async (): Promise<void> => {
    const requestId = ++requestRef.current
    receipt.current = { generation: requestId, ok: false }
    try {
      const [nextSources, nextListings] = await Promise.all([
        window.api.plugins.listMarketplaces(),
        window.api.plugins.listMarketplacePlugins()
      ])
      if (mountedRef.current && requestId === requestRef.current) {
        setSources(nextSources)
        setListings(nextListings)
        setError(null)
        receipt.current = { generation: requestId, ok: true }
      }
    } catch (cause) {
      if (mountedRef.current && requestId === requestRef.current) {
        setError(formatError(cause))
      }
    } finally {
      if (mountedRef.current && requestId === requestRef.current) {
        setLoading(false)
      }
    }
  }, [mountedRef, formatError])
  const reloadWithReceipt = useCallback(async (): Promise<(() => boolean) | undefined> => {
    const generation = requestRef.current + 1
    await loadMarketplaceData()
    const stillCurrent = (): boolean =>
      mountedRef.current &&
      requestRef.current === generation &&
      receipt.current.generation === generation &&
      receipt.current.ok
    return stillCurrent() ? stillCurrent : undefined
  }, [mountedRef, loadMarketplaceData])
  useEffect(
    () => () => {
      requestRef.current++
    },
    []
  )
  return { sources, listings, loading, error, setError, loadMarketplaceData, reloadWithReceipt }
}
